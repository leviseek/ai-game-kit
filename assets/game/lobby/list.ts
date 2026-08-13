import type { Logger } from "../../framework";
import { gameTypeCatalog, lobbyItemNodeName, LOBBY_LIST_ENTRY } from "./catalog";
import type { GameLobbyHost } from "./host";
import { createGameLobby, type GameLobby } from "./lobby";

/** 列表页流：持有会话编排（lobby），UI 就绪后打开列表页并装配点击。 */
export interface GameListFlow {
    /** 打开游戏列表页；UI 根未就绪时按固定间隔重试（对齐宿主原语 ensureUiReady 幂等语义）。 */
    openListPageWithRetry(retryLeft?: number): void;
    /** 释放列表流持有的会话编排引用；幂等。 */
    dispose(): void;
}

/**
 * 游戏列表页编排：从宿主（GameLobbyHost）经 boot 注册桥注入，承担原
 * GameLobbyHostImpl 的 openListPageWithRetry/openListPage/ensureLobby 职责。
 * 每次重试重新触发 UI 根初始化（ensureUiReady 内部 init 幂等）：GRoot 首帧后
 * 才可用，早期失败保持未初始化，若只轮询就绪状态将永远为 false；重试使 GRoot
 * 就绪后即成功，不依赖固定时长。lobby 对象在列表流内持有，dispose 时释放。
 */
export function createGameListFlow(host: GameLobbyHost, logger: Logger): GameListFlow {
    const lobby: GameLobby = createGameLobby(host);
    let disposed = false;

    function openListPageWithRetry(retryLeft = 20): void {
        if (!host.ensureUiReady()) {
            if (retryLeft > 0) {
                setTimeout(() => {
                    if (disposed) {
                        return;
                    }
                    openListPageWithRetry(retryLeft - 1);
                }, 100);
            } else {
                logger.error("[lobby] list page open timed out: UI root not ready");
            }
            return;
        }
        openListPage().catch((error) => {
            logger.error("[lobby] list page open failed", undefined, error instanceof Error ? error : undefined);
        });
    }

    /**
     * 打开游戏列表页并装配列表项点击回调：可玩品类经 lobby.enter 进入真实页面，
     * 不可玩项（playable=false）不登记点击（列表呈现占位）。列表包经宿主
     * openGlobalPage 加载进全局 uiScope 常驻，退出品类会话时不受影响。
     */
    async function openListPage(): Promise<void> {
        // 列表页跨包引用共享 Common（btn_* 按钮组件），先确保其已注册
        await host.ensureSharedUiDependencies();

        const handle = await host.openGlobalPage(LOBBY_LIST_ENTRY);

        // 列表项点击：按 catalog 可玩品类登记进入回调（节点名 btn_<id>）
        for (const info of gameTypeCatalog) {
            if (!info.playable) {
                continue;
            }
            const item = handle.node(lobbyItemNodeName(info.id));
            item?.onClick(() => {
                lobby.enter(info.id).catch((error) => {
                    logger.error("[lobby] enter failed", undefined, error instanceof Error ? error : undefined);
                });
            });
        }
    }

    return {
        openListPageWithRetry,
        dispose: () => {
            if (disposed) {
                return;
            }
            disposed = true;
            // 释放活动会话（若有）；全局列表页本身随宿主作用域释放
            void lobby.exit();
        },
    };
}
