import type { ViewModelNode } from "../../../framework";
import { createViewModelRenderer } from "../../../framework";
import type { GameFixture } from "../../../game/fixture/GameFixture";
import type { GamePresenter } from "../../../game/lobby/presenter";
import type { AutoBattleFixture } from "../assembly";
import {
    buildAutoBattleBindings,
    createAutoBattleViewModel,
    formatAutoBattleEvent,
    type AutoBattleCommands,
    type AutoBattleViewModel,
} from "./view";

/**
 * 自动战斗战场呈现器：把 auto_battle 夹具战斗状态绑定到 BattleView 节点。
 * 固定节拍驱动模拟时钟前进并逐行动 tick（每 tick 一个行动），然后按当前
 * 状态与事件日志重渲染；战斗终局后停止 tick（页面保留终局画面）。挡位只
 * 改变驱动节拍：按当前倍率放大模拟时间推进量与每节拍的 tick 次数，不改
 * tick 内容与战斗结果；挡位状态以夹具为准（fixture.getSpeed/cycleSpeed）。
 * dispose 清理渲染器与时钟驱动。
 */
export function createAutoBattlePresenter(
    fixture: GameFixture,
    node: (name: string) => ViewModelNode | undefined,
): GamePresenter {
    const autoBattle = fixture as AutoBattleFixture;

    let lastTick = Date.now();
    let timer: ReturnType<typeof setInterval> | undefined;

    const autoBattleCommands: AutoBattleCommands = {
        restart: () => {
            autoBattle.battle.restart();
            render();
        },
        cycleSpeed: () => {
            // 挡位由 fixture 持有（唯一真相源）；presenter 不复制 speed——渲染与
            // 驱动节拍统一读 fixture.getSpeed()，避免双源不同步
            autoBattle.cycleSpeed();
            render();
        },
    };

    const renderer = createViewModelRenderer<AutoBattleViewModel>({
        node,
        bindings: [],
    });

    function render(): void {
        const state = autoBattle.battle.state;
        const nameOf = (id: string): string =>
            state.units.find((unit) => unit.id === id)?.name ?? id;
        const log = autoBattle.battle.events.map((event) =>
            formatAutoBattleEvent(event, nameOf),
        );
        const vm = createAutoBattleViewModel(state, log, autoBattle.getSpeed());
        renderer.setBindings(buildAutoBattleBindings(autoBattleCommands, vm));
        renderer.setViewModel(vm);
    }

    // 固定节拍驱动模拟时钟前进并按当前状态刷新页面；终局后不再推进行动。
    // 挡位放大每节拍的模拟时间与行动数：x2/x3 下同节拍推进更多行动。
    timer = setInterval(() => {
        const now = Date.now();
        autoBattle.clock.advance((now - lastTick) * autoBattle.getSpeed());
        lastTick = now;
        if (autoBattle.battle.state.phase === "fighting") {
            for (let index = 0; index < autoBattle.getSpeed(); index += 1) {
                autoBattle.battle.tick();
            }
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
