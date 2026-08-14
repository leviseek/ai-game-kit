import { EnumUiLayer, FuiViewCleanupError, type ILogger, type IResourceScope } from "../../framework";
import { lookupBundle, type IResourceProvider } from "../../framework";
import type { FairyGuiPageHandle } from "../../framework/adapters/cocos/ui/FairyGuiPageAdapter";
import { createFairyGuiViewHandle } from "../../framework/adapters/cocos/ui/FairyGuiViewHandle";
import { createFairyGuiListViewHandle } from "../../framework/adapters/cocos/ui/FairyGuiListHandle";
import { createDynamicComponentViewHandle } from "../../framework/adapters/cocos/ui/DynamicComponentViewHandle";
import type { GameEntryInfo } from "../../game/lobby/catalog";
import type { EntryPageHandle, GameLobbyHost } from "../../game/lobby/host";
import { BUNDLES, PACKAGE_PATHS, SENTINELS } from "../constants";
import type { UiHost } from "./UiHost";

/**
 * GameLobbyHost 宿主实现依赖：AppRoot 经工厂注入共享 UiHost 与资源提供者。
 */
export interface GameLobbyHostDeps {
    readonly host: UiHost;
    readonly resourceProvider: IResourceProvider;
    readonly logger: ILogger;
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
    private readonly logger: ILogger;
    private lobbyPage?: FairyGuiPageHandle;
    private lobbyScope?: IResourceScope;

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
        const handle = await this.host.loadPackage(BUNDLES.ui, PACKAGE_PATHS.common);
        if (handle.state !== "ready") {
            throw new Error(`lobby: shared ui dependency load failed for "${PACKAGE_PATHS.common}" (${handle.state})`);
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
        const pkgHandle = this.resourceProvider.loadPackage(BUNDLES.ui, pkgPath);
        scope.retain(pkgHandle);
        const loaded = await pkgHandle.done;
        if (loaded.state !== "ready") {
            scope.release();
            throw new Error(`lobby host: package load failed for "${pkgPath}" (${loaded.state})`);
        }

        const page = adapter.createPage(entry.route, EnumUiLayer.Normal, {
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
        const navResult = this.host.navigator?.open(entry.route, { layer: EnumUiLayer.Normal });
        const navPage = navResult?.ok === true ? navResult.page : undefined;

        // 节点解析器：渲染器与游戏层只消费 IViewModelNode 契约，fgui 类型不出
        // 组合根（design decision 7 边界）。装配方式由 game 侧 GameEntryInfo 声明：
        // resolver "dynamic" 用品类动态映射数组装配通用动态组件解析器
        // （`unit_{id}` 系列运行时实例化 UnitSlot、`fx_*_{id}` 系列实例化命中
        // 反馈特效），映射经 samples 注册桥按 mappingKey 运行时读取（boot 不
        // 静态 import game bundle，维护 boot 边界）；"list" 装配列表解析器
        // （候选 GList 虚拟列表）；缺省普通视图解析器。新增品类页面只需在
        // game 侧 catalog 声明，boot 装配层无需改动。
        const resolver = entry.resolver ?? "view";
        const unitMapping =
            resolver === "dynamic"
                ? (
                      lookupBundle("samples") as {
                          readonly unitNodeMappings?: Readonly<Record<string, unknown>>;
                      }
                  )?.unitNodeMappings?.[entry.mappingKey ?? ""]
                : undefined;
        const node = resolver === "dynamic" && unitMapping !== undefined ? createDynamicComponentViewHandle(page.view as never, unitMapping as never) : createFairyGuiViewHandle(page.view as never);

        // 列表解析器：presenter 经 page.list 驱动候选渲染（对齐战场页动态单位
        // 映射装配路径）
        const list = resolver === "list" ? createFairyGuiListViewHandle(page.view as never) : undefined;

        const handle: EntryPageHandle = {
            node,
            list,
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
     * GameLobbyHost.switchEntryPage：会话内切换到另一入口页——先关闭当前
     * 页面（触发登记的退出联动前由调用方处理）并释放作用域，再打开新页建立
     * 新作用域。供多页面品类（auto_battle 编队页 → 战场页）切换使用。
     */
    async switchEntryPage(entry: GameEntryInfo): Promise<EntryPageHandle> {
        await this.closeEntryPage(undefined as unknown as EntryPageHandle);
        return this.openEntryPage(entry);
    }

    /**
     * GameLobbyHost.closeEntryPage：关闭导航页（触发登记的退出回调，幂等）、
     * 销毁入口页、释放会话资源作用域。导航关闭/页面销毁失败不阻断会话作用域
     * 释放；全部失败聚合为 FuiViewCleanupError。重复关闭幂等。
     */
    async closeEntryPage(_handle: EntryPageHandle): Promise<void> {
        const page = this.lobbyPage;
        const scope = this.lobbyScope;
        this.lobbyPage = undefined;
        this.lobbyScope = undefined;
        const errors: unknown[] = [];
        if (page !== undefined) {
            const navigator = this.host.navigator;
            // 关闭导航页触发登记在 UiPage 的"退出会话"回调；已关闭时幂等。
            // 失败被隔离，不阻断页面销毁与会话 scope 释放
            try {
                if (navigator !== undefined) {
                    const top = navigator.top;
                    if (top !== undefined) {
                        navigator.close(top.id);
                    }
                }
            } catch (error) {
                errors.push(error);
            }
            // 销毁入口页；失败被隔离，不阻断会话 scope 释放
            try {
                this.host.pageAdapter?.destroy(page);
            } catch (error) {
                errors.push(error);
            }
        }
        // 会话作用域始终释放：导航关闭/页面销毁失败也不遗留会话资源
        try {
            scope?.release();
        } catch (error) {
            errors.push(error);
        }
        if (errors.length > 0) {
            throw new FuiViewCleanupError("GameLobbyHostImpl.closeEntryPage", errors);
        }
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
        const handle = await this.host.loadPackage(BUNDLES.ui, pkgPath);
        if (handle.state !== "ready") {
            throw new Error(`lobby host: global page package load failed for "${pkgPath}" (${handle.state})`);
        }

        const page = adapter.createPage(entry.route, EnumUiLayer.Normal, {
            packageName: entry.packageName,
            resName: entry.resName,
        });
        if (page.disposed || page.view === undefined) {
            throw new Error(`lobby host: create global page failed for "${entry.resName}"`);
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
        const handle = this.resourceProvider.load(bundle, this.bundleSentinel(bundle));
        const loaded = await handle.done;
        if (loaded.state !== "ready") {
            throw new Error(`lobby host: bundle load failed for "${bundle}" (${loaded.state})`);
        }
    }

    /** bundle → 哨兵资源映射：game 用同名场景资源，其余 bundle 用 placeholder。 */
    private bundleSentinel(bundle: string): string {
        return bundle === BUNDLES.game ? BUNDLES.game : SENTINELS.placeholder;
    }

    /** GameLobbyHost.ensureUiReady：初始化 UI 根并返回是否就绪（GRoot 可用）。幂等。 */
    ensureUiReady(): boolean {
        return this.host.smokeUiInit();
    }

    /** 释放会话级作用域与入口页引用（随组合根销毁）。单步失败不阻断引用收敛，幂等。 */
    dispose(): void {
        const errors: unknown[] = [];
        try {
            this.lobbyScope?.release();
        } catch (error) {
            errors.push(error);
        }
        this.lobbyScope = undefined;
        this.lobbyPage = undefined;
        if (errors.length > 0) {
            throw new FuiViewCleanupError("GameLobbyHostImpl.dispose", errors);
        }
    }
}

export function createGameLobbyHost(deps: GameLobbyHostDeps): GameLobbyHostImpl {
    return new GameLobbyHostImpl(deps);
}
