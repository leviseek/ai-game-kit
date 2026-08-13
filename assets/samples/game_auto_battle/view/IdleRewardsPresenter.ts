import type { ViewModelNode } from "../../../framework";
import { createViewModelRenderer } from "../../../framework";
import type { GamePresenter } from "../../../game/lobby/presenter";
import type { GameSessionNavigator } from "../../../game/lobby/presenter";
import type { GameFixture } from "../../../game/fixture/GameFixture";
import { AUTO_BATTLE_LINEUP_ENTRY } from "../../../game/lobby/catalog";
import type { AutoBattleFixture } from "../assembly";
import { createLineupEditorPresenter } from "./LineupPresenter";
import { createIdleRewardsBindings, createIdleRewardsViewModel, type IdleRewardsViewModel } from "./IdleRewards";

/**
 * 挂机收益页呈现器：把 fixture.idleRewards 状态渲染到 IdleRewardsView 节点。
 * 打开时先异步 restore（恢复上次会话存档：累计收益与 lastSeenAt），再按当前
 * 墙钟预计算离线预览（不推进 lastSeenAt，纯展示）；定时刷新使预览随真实时间
 * 增长。点击领取经命令入账（幂等：结算推进 lastSeenAt，重复点击不重复入账）
 * 并刷新显示；返回按钮经会话导航回编队页。dispose 清理渲染器与定时器。
 */
export function createIdleRewardsPresenter(fixture: GameFixture, node: (name: string) => ViewModelNode | undefined, session?: GameSessionNavigator): GamePresenter {
    const autoBattle = fixture as AutoBattleFixture;

    const renderer = createViewModelRenderer<IdleRewardsViewModel>({
        node,
        bindings: createIdleRewardsBindings({
            claim: () => {
                // 领取入账：结算即推进 lastSeenAt，持久化在 fixture.settleOffline 内触发
                autoBattle.idleRewards.settleOffline();
                render();
            },
            back: () => {
                // 返回编队页：会话内切页并重装配编队呈现器
                if (session !== undefined) {
                    session.openEntry(AUTO_BATTLE_LINEUP_ENTRY, createLineupEditorPresenter);
                }
            },
        }),
    });

    function render(): void {
        const vm = createIdleRewardsViewModel(
            autoBattle.idleRewards.state,
            // 预览委托控制器 previewOffline：与 settleOffline 用同一速率与墙钟，
            // 保证展示 = 实际入账
            () => autoBattle.idleRewards.preview(),
        );
        renderer.setViewModel(vm);
    }

    // 打开页面先恢复上次会话存档（累计收益与 lastSeenAt），再渲染；
    // restore 失败（损坏/未来版本）保持当前状态并渲染，不阻塞页面
    void autoBattle.idleRewards.restore().then(() => {
        render();
    });

    render();

    // 定时刷新预览：真实墙钟（Date.now）随时间流逝，预览收益持续增长；
    // 测试环境无真实时间源时 advance 驱动，刷新仍安全（preview 不推进状态）
    const refreshTimer = setInterval(() => {
        render();
    }, 1000);

    return {
        render,
        dispose: () => {
            clearInterval(refreshTimer);
            renderer.dispose();
        },
    };
}
