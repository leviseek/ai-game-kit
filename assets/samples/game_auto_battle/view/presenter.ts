import type { ViewModelNode } from "../../../framework";
import { createViewModelRenderer } from "../../../framework";
import type { GameFixture } from "../../../game/fixture/GameFixture";
import type { GamePresenter } from "../../../game/lobby/presenter";
import type { AutoBattleFixture } from "../assembly";
import {
    createAutoBattleBindings,
    createAutoBattleViewModel,
    formatAutoBattleEvent,
    type AutoBattleCommands,
} from "./view";

/**
 * 自动战斗战场呈现器：把 auto_battle 夹具战斗状态绑定到 BattleView 节点。
 * 固定节拍驱动模拟时钟前进并逐行动 tick（每 tick 一个行动），然后按当前
 * 状态与事件日志重渲染；战斗终局后停止 tick（页面保留终局画面）。dispose
 * 清理渲染器与时钟驱动。
 */
export function createAutoBattlePresenter(
    fixture: GameFixture,
    node: (name: string) => ViewModelNode | undefined,
): GamePresenter {
    const autoBattle = fixture as AutoBattleFixture;

    let lastTick = Date.now();
    let timer: ReturnType<typeof setInterval> | undefined;

    const renderer = createViewModelRenderer({
        node,
        bindings: createAutoBattleBindings({
            restart: () => {
                autoBattle.battle.restart();
                render();
            },
        } satisfies AutoBattleCommands),
    });

    function render(): void {
        const state = autoBattle.battle.state;
        const nameOf = (id: string): string =>
            state.units.find((unit) => unit.id === id)?.name ?? id;
        const log = autoBattle.battle.events.map((event) =>
            formatAutoBattleEvent(event, nameOf),
        );
        renderer.setViewModel(createAutoBattleViewModel(state, log));
    }

    // 固定节拍驱动模拟时钟前进并按当前状态刷新页面；终局后不再推进行动，
    // 只保留渲染（与冒烟的手动 tick 驱动对齐，渲染永远基于不可变 state 快照）
    timer = setInterval(() => {
        const now = Date.now();
        autoBattle.clock.advance(now - lastTick);
        lastTick = now;
        if (autoBattle.battle.state.phase === "fighting") {
            autoBattle.battle.tick();
        }
        render();
    }, 100);

    render();

    return {
        render,
        dispose: () => {
            if (timer !== undefined) {
                clearInterval(timer);
                timer = undefined;
            }
            renderer.dispose();
        },
    };
}
