import {
    createUiNavigator,
    FuiViewCleanupError,
    type Logger,
    type ResourceHandle,
    type ResourceScope,
    type UiLayer,
    type UiNavigator,
} from "../../framework";
import type { IResourceProvider } from "../../framework";
import {
    createFairyGuiPageAdapter,
    type FairyGuiPageAdapter,
} from "../../framework/adapters/cocos/ui/FairyGuiPageAdapter";
import { createFairyGuiBoundView } from "../../framework/adapters/cocos/ui/FuiViewHost";
import type {
    CocosUiRoot,
    GRootLike,
} from "../../framework/adapters/cocos/ui/CocosUiRoot";

/**
 * UI 根宿主依赖：由组合根把装配好的引擎接缝注入，AppRoot/BootFlow/GameLobbyHostImpl
 * 共用同一实例，保证 GRoot 全生命周期只初始化一次（design D3/D4）。
 */
export interface UiHostDeps {
    readonly uiRoot: CocosUiRoot;
    readonly resourceProvider: IResourceProvider;
    readonly logger: Logger;
}

/**
 * UI 根宿主：封装 FairyGUI GRoot 获取、页面适配器（GRoot 七层容器 + resize 订阅）
 * 建立，以及全局常驻 uiScope 的加载/释放。init 幂等，GRoot 未就绪时保持未初始化
 * 并上报失败（不静默吞掉）；页面适配器按需建立后由后续显式调用幂等复用。
 */
export class UiHost {
    private readonly uiRoot: CocosUiRoot;
    private readonly resourceProvider: IResourceProvider;
    private readonly logger: Logger;
    private adapter?: FairyGuiPageAdapter;
    private nav?: UiNavigator;
    private uiScope?: ResourceScope;
    private resizeUnsubscribe?: () => void;

    constructor(deps: UiHostDeps) {
        this.uiRoot = deps.uiRoot;
        this.resourceProvider = deps.resourceProvider;
        this.logger = deps.logger;
    }

    /**
     * 引擎 ready 后初始化 UI 根宿主。GRoot 未就绪时 init 抛错，此处仅上报且保持
     * 未初始化；init 幂等可由后续显式调用再次触发（对齐 CocosUiRoot.init 语义）。
     */
    init(): void {
        try {
            this.uiRoot.init();
        } catch (error) {
            this.logger.error(
                "[ui] FairyGUI UI root initialization failed",
                undefined,
                error instanceof Error ? error : undefined,
            );
        }
    }

    /**
     * 按需建立页面适配器：uiRoot 初始化成功且尚未创建时创建，并建立七层
     * GRoot 容器与 resize 订阅。GRoot 未就绪时返回 false，调用方可重试
     * （对齐 init 幂等语义）。
     */
    ensurePageAdapter(): boolean {
        if (this.adapter !== undefined) {
            return true;
        }
        const root = this.uiRoot.root;
        if (root === undefined) {
            return false;
        }
        if (this.nav === undefined) {
            this.nav = createUiNavigator();
        }
        this.adapter = createFairyGuiPageAdapter({
            root,
            provider: this.resourceProvider,
            navigator: this.nav,
            // 组合创建闭包：先查 FuiComponentRegistry（@FUIBind 登记的绑定视图），
            // 未命中回退既有 createFairyGuiView（存量/动态页路径不变）
            createView: createFairyGuiBoundView(),
        });
        this.adapter.init();
        // 窗口尺寸变化 → UI 根同步 root 布局后通知适配器同步层级容器，无需手动刷新
        this.resizeUnsubscribe?.();
        this.resizeUnsubscribe = this.uiRoot.onResize((width, height) => {
            this.adapter?.resize(width, height);
        });
        return true;
    }

    /** 冒烟触发：初始化 UI 根宿主与页面适配器。返回是否就绪；GRoot 未就绪时返回 false。 */
    smokeUiInit(): boolean {
        this.init();
        return this.ensurePageAdapter();
    }

    /** 冒烟观察：页面适配器是否已就绪（GRoot 已初始化）。 */
    smokeUiReady(): boolean {
        return this.adapter !== undefined && this.uiRoot.initialized === true;
    }

    /** 冒烟触发：打开页面。pageAdapter 未就绪时返回 false；页面创建失败保留诊断。 */
    openPage(
        route: string,
        layer: UiLayer,
        packageName: string,
        resName: string,
    ): boolean {
        if (!this.ensurePageAdapter() || this.adapter === undefined) {
            return false;
        }
        const page = this.adapter.createPage(route, layer, {
            packageName,
            resName,
        });
        if (page.disposed) {
            return false;
        }
        this.adapter.mount(page);
        return true;
    }

    /** 冒烟触发：关闭页面（先卸载挂载再销毁 View）。返回是否关闭。 */
    closePage(route: string): boolean {
        if (this.adapter === undefined) {
            return false;
        }
        const page = this.adapter.findPage(route);
        if (page === undefined) {
            return false;
        }
        this.adapter.destroy(page);
        return true;
    }

    /** 冒烟观察：查询 Bundle 是否已无作用域持有（可卸载）。 */
    canUnload(bundle: string): boolean {
        return this.resourceProvider.canUnload(bundle);
    }

    /**
     * 加载 FairyGUI package 并登记到全局常驻 uiScope，返回加载结果标识。同一
     * uiScope 对同 key 重复 retain 幂等；uiScope 被 release 后下次调用自动重建。
     */
    loadPackage(bundle: string, path: string): Promise<ResourceHandle> {
        if (this.uiScope === undefined) {
            this.uiScope = this.resourceProvider.createScope();
        }
        const handle = this.resourceProvider.loadPackage(bundle, path);
        this.uiScope.retain(handle);
        return handle.done;
    }

    /** 释放全局常驻 uiScope，触发 package → Bundle 逆序释放。幂等。 */
    release(): void {
        if (this.uiScope === undefined) {
            return;
        }
        // 先收敛引用：即使 release 抛错，重复调用仍为 no-op（幂等不依赖清理成功）
        const scope = this.uiScope;
        this.uiScope = undefined;
        scope.release();
    }

    /** 页面适配器（GRoot 七层容器）；未就绪时为 undefined。 */
    get pageAdapter(): FairyGuiPageAdapter | undefined {
        return this.adapter;
    }

    /** UI 导航器；页面适配器建立后可用。 */
    get navigator(): UiNavigator | undefined {
        return this.nav;
    }

    /** 已初始化的 GRoot；未初始化时为 undefined。 */
    get root(): GRootLike | undefined {
        return this.uiRoot.root;
    }

    /**
     * 释放：退订 resize、销毁页面适配器与导航器、释放全局 uiScope。
     * 单步失败不阻断其余步骤；全部失败聚合为 FuiViewCleanupError。幂等。
     */
    dispose(): void {
        const errors: unknown[] = [];
        try {
            this.resizeUnsubscribe?.();
        } catch (error) {
            errors.push(error);
        }
        this.resizeUnsubscribe = undefined;
        try {
            this.adapter?.dispose();
        } catch (error) {
            errors.push(error);
        }
        this.adapter = undefined;
        try {
            this.nav?.dispose();
        } catch (error) {
            errors.push(error);
        }
        this.nav = undefined;
        try {
            this.release();
        } catch (error) {
            errors.push(error);
        }
        if (errors.length > 0) {
            throw new FuiViewCleanupError("UiHost.dispose", errors);
        }
    }
}

export function createUiHost(deps: UiHostDeps): UiHost {
    return new UiHost(deps);
}
