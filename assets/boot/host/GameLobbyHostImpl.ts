import type { Logger, ResourceScope } from "../../framework";
import type { IResourceProvider } from "../../framework";
import type { FairyGuiPageHandle } from "../../framework/adapters/cocos/ui/FairyGuiPageAdapter";
import { createFairyGuiViewHandle } from "../../framework/adapters/cocos/ui/FairyGuiViewHandle";
import {
    createGameLobby,
    gameTypeCatalog,
    lobbyItemNodeName,
    LOBBY_LIST_ENTRY,
    type EntryPageHandle,
    type GameEntryInfo,
    type GameLobby,
    type GameLobbyHost,
} from "../../game/fixture/lobby";
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
 * GameLobbyHost 宿主实现：打开/关闭品类入口页、加载共享 UI 依赖（Common）与
 * 默认列表页打开。AppRoot 作为薄代理转发 openEntryPage/closeEntryPage；会话
 * 进入/退出编排（夹具生命周期、呈现器装配）留在游戏层 lobby。品类包走会话
 * 作用域按需加载、退出全量释放；列表包与 Common 走全局 uiScope 常驻。
 */
export class GameLobbyHostImpl implements GameLobbyHost {
    private readonly host: UiHost;
    private readonly resourceProvider: IResourceProvider;
    private readonly logger: Logger;
    private lobby?: GameLobby;
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

    /** 惰性装配品类会话编排：组合逻辑留在游戏层 lobby，宿主只提供打开/关闭能力。 */
    private ensureLobby(): GameLobby {
        if (this.lobby === undefined) {
            this.lobby = createGameLobby(this);
        }
        return this.lobby;
    }

    /**
     * 默认入口：无启动参数时打开游戏列表页。每次重试重新触发 UI 根初始化
     * （init 幂等）：GRoot 首帧后才可用，早期失败保持未初始化，若只轮询
     * smokeUiReady 就绪状态将永远为 false；重试 init 使 GRoot 就绪后即成功
     * （对齐 runUiSmoke 经 smokeUiInit 重试初始化的路径），不依赖固定时长。
     */
    openListPageWithRetry(retryLeft = 20): void {
        if (!this.host.smokeUiInit()) {
            if (retryLeft > 0) {
                setTimeout(() => this.openListPageWithRetry(retryLeft - 1), 100);
            } else {
                this.logger.error("[lobby] list page open timed out: UI root not ready");
            }
            return;
        }
        this.openListPage().catch((error) => {
            this.logger.error(
                "[lobby] list page open failed",
                undefined,
                error instanceof Error ? error : undefined,
            );
        });
    }

    /**
     * 打开游戏列表页并装配列表项点击回调：可玩品类经 lobby.enter 进入真实页面，
     * 不可玩项（playable=false）不登记点击（列表呈现占位）。列表包加载进全局
     * uiScope 常驻，退出品类会话时不受影响。
     */
    private async openListPage(): Promise<void> {
        if (!this.host.ensurePageAdapter()) {
            throw new Error("lobby list: page adapter not ready");
        }
        const adapter = this.host.pageAdapter;
        if (adapter === undefined) {
            throw new Error("lobby list: page adapter not ready");
        }

        // 列表页跨包引用共享 Common（btn_* 按钮组件），先确保其已注册
        await this.ensureSharedUiDependencies();

        const pkgPath = `${LOBBY_LIST_ENTRY.packageName}/${LOBBY_LIST_ENTRY.packageName}`;
        const handle = await this.host.loadPackage("ui", pkgPath);
        if (handle.state !== "ready") {
            throw new Error(
                `lobby list: package load failed for "${pkgPath}" (${handle.state})`,
            );
        }

        const page = adapter.createPage(
            LOBBY_LIST_ENTRY.route,
            "normal",
            {
                packageName: LOBBY_LIST_ENTRY.packageName,
                resName: LOBBY_LIST_ENTRY.resName,
            },
        );
        if (page.disposed || page.view === undefined) {
            throw new Error(
                `lobby list: create page failed for "${LOBBY_LIST_ENTRY.resName}"`,
            );
        }
        adapter.mount(page);

        // 列表项点击：按 catalog 可玩品类登记进入回调（节点名 btn_<id>）
        const node = createFairyGuiViewHandle(page.view as never);
        const lobby = this.ensureLobby();
        for (const info of gameTypeCatalog) {
            if (!info.playable) {
                continue;
            }
            const item = node(lobbyItemNodeName(info.id));
            item?.onClick(() => {
                lobby.enter(info.id).catch((error) => {
                    this.logger.error(
                        "[lobby] enter failed",
                        undefined,
                        error instanceof Error ? error : undefined,
                    );
                });
            });
        }
    }

    /** 释放会话级作用域与列表页引用（随组合根销毁）。幂等。 */
    dispose(): void {
        this.lobbyScope?.release();
        this.lobbyScope = undefined;
        this.lobbyPage = undefined;
        this.lobby = undefined;
    }
}

export function createGameLobbyHost(deps: GameLobbyHostDeps): GameLobbyHostImpl {
    return new GameLobbyHostImpl(deps);
}
