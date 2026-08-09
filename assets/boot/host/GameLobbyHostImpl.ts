import type { Logger, ResourceScope } from "../../framework";
import type { IResourceProvider } from "../../framework";
import type { FairyGuiPageHandle } from "../../framework/adapters/cocos/ui/FairyGuiPageAdapter";
import { createFairyGuiViewHandle } from "../../framework/adapters/cocos/ui/FairyGuiViewHandle";
import type { GameEntryInfo } from "../../game/lobby/catalog";
import type {
    EntryPageHandle,
    GameLobbyHost,
} from "../../game/lobby/host";
import type { UiHost } from "./UiHost";

/**
 * GameLobbyHost 宿主实现依赖：AppRoot 经工厂注入共享 UiHost 与资源提供者。
 */
export interface GameLobbyHostDeps {
    readonly host: UiHost;
    readonly resourceProvider: IResourceProvider;
    readonly logger: Logger;
}

/**
 * GameLobbyHost 宿主实现：纯宿主原语，只提供打开/关闭页面、Bundle 加载与 UI
 * 就绪查询能力，不含游戏层编排。会话编排（夹具生命周期、呈现器装配）与默认
 * 列表页打开逻辑已迁至 game bundle 的 lobby 模块（列表流经注册桥注入本宿主）。
 * 品类包走会话作用域按需加载、退出全量释放；列表包与 Common 走全局 uiScope 常驻。
 */
export class GameLobbyHostImpl implements GameLobbyHost {
    private readonly host: UiHost;
    private readonly resourceProvider: IResourceProvider;
    private readonly logger: Logger;
    private lobbyPage?: FairyGuiPageHandle;
    private lobbyScope?: ResourceScope;

    constructor(deps: GameLobbyHostDeps) {
        this.host = deps.host;
        this.resourceProvider = deps.resourceProvider;
        this.logger = deps.logger;
    }

    /**
     * 加载共享 UI 依赖包并注册进全局作用域常驻。Demo/CardGame 等品类包跨包
     * 引用通用资源包 Common（如按钮/进度条组件），而 fgui loadPackage 不自动
     * 加载依赖包：若 Common 未注册，跨包组件解析失败退化为空组件，按钮无命中、
     * 点击事件不触发。本方法先加载 Common 使引用可解析；Common 常驻全局作用域，
     * 退出品类会话不受影响。重复调用幂等（加载协调器按 key 缓存终态）。
     */
    async ensureSharedUiDependencies(): Promise<void> {
        const handle = await this.host.loadPackage("ui", "Common/Common");
        if (handle.state !== "ready") {
            throw new Error(
                `lobby: shared ui dependency load failed for "Common/Common" (${handle.state})`,
            );
        }
    }

    /**
     * GameLobbyHost.openEntryPage：为品类会话建立独立资源作用域（持有品类
     * package），打开并挂载真实入口页，暴露节点解析器与"页面关闭 → 会话退出"
     * 联动登记。返回句柄供 closeEntryPage 逆序释放；重复打开同 route 由导航
     * 器 duplicate 策略保护（此处 default reject）。
     */
    async openEntryPage(entry: GameEntryInfo): Promise<EntryPageHandle> {
        if (!this.host.ensurePageAdapter()) {
            throw new Error("lobby host: page adapter not ready");
        }
        const adapter = this.host.pageAdapter;
        if (adapter === undefined) {
            throw new Error("lobby host: page adapter not ready");
        }

        // 品类包跨包引用共享 Common（如 BattleView 按钮），先确保其已注册
        await this.ensureSharedUiDependencies();

        // 会话级资源作用域：仅持有本次会话的品类包，退出时全量释放，不影响
        // 列表包（全局 uiScope 常驻）。这是 MVP 单会话的必要隔离。
        const scope = this.resourceProvider.createScope();
        const pkgPath = `${entry.packageName}/${entry.packageName}`;
        const pkgHandle = this.resourceProvider.loadPackage("ui", pkgPath);
        scope.retain(pkgHandle);
        const loaded = await pkgHandle.done;
        if (loaded.state !== "ready") {
            scope.release();
            throw new Error(
                `lobby host: package load failed for "${pkgPath}" (${loaded.state})`,
            );
        }

        const page = adapter.createPage(entry.route, "normal", {
            packageName: entry.packageName,
            resName: entry.resName,
        });
        if (page.disposed || page.view === undefined) {
            scope.release();
            throw new Error(`lobby host: create page failed for "${entry.resName}"`);
        }
        adapter.mount(page);

        // 打开导航页并登记"退出会话"disposable：导航关闭该页面（如返回键）时
        // 经 UiPage 作用域自然触发会话清理，不遗留运行中的夹具。
        const navResult = this.host.navigator?.open(entry.route, { layer: "normal" });
        const navPage = navResult?.ok === true ? navResult.page : undefined;

        // 节点解析器：渲染器与游戏层只消费 ViewModelNode 契约，fgui 类型不出
        // 组合根（design decision 7 边界）
        const node = createFairyGuiViewHandle(page.view as never);

        let handle: EntryPageHandle;
        handle = {
            node,
            onClose: (callback: () => void) => {
                // 登记到导航页作用域：导航关闭页面时触发一次（幂等）
                navPage?.addDisposable({ dispose: callback });
            },
        };
        this.lobbyPage = page;
        this.lobbyScope = scope;
        return handle;
    }

    /**
     * GameLobbyHost.closeEntryPage：关闭导航页（触发登记的退出回调，幂等）、
     * 销毁入口页、释放会话资源作用域。重复关闭幂等。
     */
    async closeEntryPage(_handle: EntryPageHandle): Promise<void> {
        const page = this.lobbyPage;
        const scope = this.lobbyScope;
        this.lobbyPage = undefined;
        this.lobbyScope = undefined;
        if (page === undefined) {
            return;
        }
        const navigator = this.host.navigator;
        if (navigator !== undefined) {
            // 关闭导航页触发登记在 UiPage 的"退出会话"回调；已关闭时幂等
            const top = navigator.top;
            if (top !== undefined) {
                navigator.close(top.id);
            }
        }
        this.host.pageAdapter?.destroy(page);
        scope?.release();
    }

    /**
     * GameLobbyHost.openGlobalPage：打开全局常驻页（列表页）。包经全局 uiScope
     * 加载常驻、不建立会话资源作用域（不占用会话槽位），返回句柄供游戏层列表
     * 流装配列表项点击；页面关闭/释放由组合根与全局作用域管理。
     */
    async openGlobalPage(entry: GameEntryInfo): Promise<EntryPageHandle> {
        if (!this.host.ensurePageAdapter()) {
            throw new Error("lobby host: page adapter not ready");
        }
        const adapter = this.host.pageAdapter;
        if (adapter === undefined) {
            throw new Error("lobby host: page adapter not ready");
        }

        // 全局页跨包引用共享 Common（如列表页按钮组件），先确保其已注册
        await this.ensureSharedUiDependencies();

        const pkgPath = `${entry.packageName}/${entry.packageName}`;
        const handle = await this.host.loadPackage("ui", pkgPath);
        if (handle.state !== "ready") {
            throw new Error(
                `lobby host: global page package load failed for "${pkgPath}" (${handle.state})`,
            );
        }

        const page = adapter.createPage(entry.route, "normal", {
            packageName: entry.packageName,
            resName: entry.resName,
        });
        if (page.disposed || page.view === undefined) {
            throw new Error(
                `lobby host: create global page failed for "${entry.resName}"`,
            );
        }
        adapter.mount(page);

        // 节点解析器：与入口页一致，供游戏层按名解析 fgui 节点（如 btn_<id>）
        const node = createFairyGuiViewHandle(page.view as never);
        // 全局页无会话联动：onClose 保持 no-op，满足 EntryPageHandle 契约
        return { node, onClose: () => {} };
    }

    /**
     * GameLobbyHost.loadBundle：经 provider.load 哨兵资源触发 Bundle 脚本执行
     * （脚本副作用完成注册桥登记）。game 用场景资源（无 placeholder.json）；
     * 其余（如 samples 品类包）用哨兵 placeholder。幂等（加载协调器按 key 缓存
     * 终态）。
     */
    async loadBundle(bundle: string): Promise<void> {
        const handle = this.resourceProvider.load(
            bundle,
            this.bundleSentinel(bundle),
        );
        const loaded = await handle.done;
        if (loaded.state !== "ready") {
            throw new Error(
                `lobby host: bundle load failed for "${bundle}" (${loaded.state})`,
            );
        }
    }

    /** bundle → 哨兵资源映射：game 用同名场景资源，其余 bundle 用 placeholder。 */
    private bundleSentinel(bundle: string): string {
        return bundle === "game" ? "game" : "placeholder";
    }

    /** GameLobbyHost.ensureUiReady：初始化 UI 根并返回是否就绪（GRoot 可用）。幂等。 */
    ensureUiReady(): boolean {
        return this.host.smokeUiInit();
    }

    /** 释放会话级作用域与入口页引用（随组合根销毁）。幂等。 */
    dispose(): void {
        this.lobbyScope?.release();
        this.lobbyScope = undefined;
        this.lobbyPage = undefined;
    }
}

export function createGameLobbyHost(deps: GameLobbyHostDeps): GameLobbyHostImpl {
    return new GameLobbyHostImpl(deps);
}
