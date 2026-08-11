import type { ViewModelNode } from "../../../framework";
import { createViewModelRenderer } from "../../../framework";
import type { GameFixture } from "../../../game/fixture/GameFixture";
import type { GamePresenter } from "../../../game/lobby/presenter";
import type { AutoBattleFixture } from "../assembly";
import { projectHitFeedbackEvents } from "./effects";
import { createEffectAnimator } from "./effect-animator";
import {
    buildAutoBattleBindings,
    createAutoBattleViewModel,
    formatAutoBattleEvent,
    gridToXY,
    type AutoBattleCommands,
    type AutoBattleViewModel,
} from "./view";

/** 入场阶段时长（ms）：战斗开始后先展示单位入场，期间不推进战斗。 */
const ENTRANCE_PHASE_MS = 3000;

/**
 * 自动战斗战场呈现器：把 auto_battle 夹具战斗状态绑定到 BattleView 节点。
 * 入场阶段（战斗开始后 ENTRANCE_PHASE_MS 内）：只渲染并推进入场动画（单位淡入
 * 到位），不推进模拟时钟与战斗行动；入场阶段结束后恢复固定节拍驱动模拟时钟
 * 前进并逐行动 tick（每 tick 一个行动）。挡位只改变驱动节拍：按当前倍率放大
 * 模拟时间推进量与每节拍的 tick 次数，不改 tick 内容与战斗结果。命中反馈与
 * 位移动画作为事件增量叠加在 state 渲染之上（每帧投影 → play → step），动画
 * 终态回到 state 姿态。dispose 清理渲染器、动画器与时钟驱动。
 */
export function createAutoBattlePresenter(
    fixture: GameFixture,
    node: (name: string) => ViewModelNode | undefined,
): GamePresenter {
    const autoBattle = fixture as AutoBattleFixture;

    let lastTick = Date.now();
    let timer: ReturnType<typeof setInterval> | undefined;
    // 特效投影游标：记录已消费事件序号，只对新事件投影（增量、幂等）
    let effectCursor = -1;
    // 入场阶段结束时间戳：入场期间只推进动画不推进战斗（入场为独立表现阶段）
    const entranceEnd = Date.now() + ENTRANCE_PHASE_MS;
    // 命中反馈动画器：节点解析复用渲染器节点，时间源用真实节拍；单位绝对
    // 坐标由 state 查 gridKey 经 gridToXY 推导，供飘字/抖动归位
    const effectAnimator = createEffectAnimator({
        node: (name: string) => node(name),
        timeSource: () => Date.now(),
        homeXYOf: (unitId: string) => {
            const unit = autoBattle.battle.state.units.find(
                (candidate) => candidate.id === unitId,
            );
            return unit === undefined ? { x: 0, y: 0 } : gridToXY(unit.gridKey);
        },
        gridXYOf: (gridKey: string) => gridToXY(gridKey),
    });

    const autoBattleCommands: AutoBattleCommands = {
        restart: () => {
            autoBattle.battle.restart();
            // 重开即新对局：特效游标重置、进行中动画清空，避免旧对局动画残留
            effectCursor = -1;
            effectAnimator.reset();
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

    /** 每帧推进命中反馈：投影新事件为特效意图并推进动画。 */
    function stepEffects(): void {
        const { effects, cursor } = projectHitFeedbackEvents(
            autoBattle.battle.events,
            effectCursor,
        );
        effectCursor = cursor;
        effectAnimator.play(effects);
        effectAnimator.step();
    }

    // 固定节拍驱动模拟时钟前进并按当前状态刷新页面；终局后不再推进行动。
    // 入场阶段内只推进动画（单位淡入到位），不推进战斗——入场是独立表现阶段。
    // 挡位放大每节拍的模拟时间与行动数：x2/x3 下同节拍推进更多行动。
    timer = setInterval(() => {
        const now = Date.now();
        if (now < entranceEnd) {
            // 入场阶段：渲染初始状态 + 推进入场动画，模拟时钟不前进、战斗不 tick
            render();
            stepEffects();
            return;
        }
        autoBattle.clock.advance((now - lastTick) * autoBattle.getSpeed());
        lastTick = now;
        if (autoBattle.battle.state.phase === "fighting") {
            for (let index = 0; index < autoBattle.getSpeed(); index += 1) {
                autoBattle.battle.tick();
            }
        }
        render();
        stepEffects();
    }, 100);

    render();

    return {
        render,
        dispose: () => {
            if (timer !== undefined) {
                clearInterval(timer);
                timer = undefined;
            }
            effectAnimator.reset();
            renderer.dispose();
        },
    };
}
