import type { ViewModelNode } from "../../../framework";
import { createViewModelRenderer } from "../../../framework";
import type { GameFixture } from "../../../game/fixture/GameFixture";
import type { GamePresenter } from "../../../game/lobby/presenter";
import type { AutoBattleFixture } from "../assembly";
import type { AutoBattleSide } from "../models";
import { projectHitFeedbackEvents } from "./effects";
import { createEffectAnimator } from "./effect-animator";
import { createVsEntranceTemplate } from "./vs-entrance";
import {
    buildAutoBattleBindings,
    createAutoBattleViewModel,
    formatAutoBattleEvent,
    gridToXY,
    type AutoBattleCommands,
    type AutoBattleViewModel,
} from "./view";

/** VS 阶段子时长（ms）：入场（武将向中心+淡入）→ 定格 → 淡出。 */
const VS_ENTRANCE_MS = 1800;
const VS_HOLD_MS = 600;
const VS_FADE_MS = 300;
/** VS 阶段总时长（ms）：覆盖入场+定格+淡出全程，让 VS 覆盖层完整演完。 */
const VS_PHASE_MS = VS_ENTRANCE_MS + VS_HOLD_MS + VS_FADE_MS;
/** 入场阶段时长（ms）：战斗开始后先展示单位入场，期间不推进战斗。 */
const ENTRANCE_PHASE_MS = 3000;

/**
 * 自动战斗战场呈现器：把 auto_battle 夹具战斗状态绑定到 BattleView 节点。
 * 三阶段状态机：VS 展示（VS_PHASE_MS，只推进入场覆盖层动画）→ 单位入场
 * （ENTRANCE_PHASE_MS，只渲染并推进单位淡入动画）→ 战斗（固定节拍驱动模拟
 * 时钟前进并逐行动 tick，每 tick 一个行动）。VS 与入场阶段不推进模拟时钟与
 * 战斗行动。挡位只改变驱动节拍：按当前倍率放大模拟时间推进量与每节拍的 tick
 * 次数，不改 tick 内容与战斗结果。命中反馈与位移动画作为事件增量叠加在 state
 * 渲染之上（每帧投影 → play → step），动画终态回到 state 姿态。restart 重置
 * 回 VS 阶段并重放覆盖层。dispose 清理渲染器、动画器、VS 覆盖层与时钟驱动。
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
    // 三阶段状态机：vs → entrance → fighting；阶段切换时间戳用真实时钟
    // （与节拍驱动同源），vs/entrance 阶段只推进对应表现动画不推进战斗
    type PresenterPhase = "vs" | "entrance" | "fighting";
    let phase: PresenterPhase = "vs";
    let vsEnd = 0;
    let entranceEnd = 0;

    /** 重置阶段时间戳到当前时刻：创建与 restart 共用，保证 restart 重演完整 VS 阶段。 */
    function beginVsPhase(): void {
        const now = Date.now();
        vsEnd = now + VS_PHASE_MS;
        entranceEnd = vsEnd + ENTRANCE_PHASE_MS;
    }
    beginVsPhase();
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

    /** 每方队长：index 最小存活单位（VS 覆盖层展示用，纯读取 state）。 */
    function leaderOf(side: AutoBattleSide): string {
        const leaders = autoBattle.battle.state.units
            .filter((unit) => unit.side === side && unit.hp > 0)
            .sort((a, b) => a.index - b.index);
        const leader = leaders[0];
        return leader === undefined ? "" : leader.name;
    }

    // VS 覆盖层：左右队长名 + VS 大字；时间源用真实时钟与阶段状态机同源。
    // 阶段时长取 entrance+hold+fade 之和（durationMs 只含入场移动+淡入，
    // hold 为入场后定格、fade 为整体淡出）。
    const vsTemplate = createVsEntranceTemplate({
        node: (name: string) => node(name),
        timeSource: () => Date.now(),
        config: {
            left: { name: leaderOf("enemy"), sideLabel: "敌方" },
            right: { name: leaderOf("ally"), sideLabel: "己方" },
            durationMs: VS_ENTRANCE_MS,
            holdMs: VS_HOLD_MS,
            fadeMs: VS_FADE_MS,
        },
    });
    vsTemplate.play();

    const autoBattleCommands: AutoBattleCommands = {
        restart: () => {
            autoBattle.battle.restart();
            // 重开即新对局：特效游标重置、进行中动画清空，避免旧对局动画残留
            effectCursor = -1;
            effectAnimator.reset();
            // 重置回 VS 阶段：覆盖层清空重放，阶段时间戳重新计时
            vsTemplate.reset();
            phase = "vs";
            beginVsPhase();
            vsTemplate.play();
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

    // 固定节拍按阶段分发：VS/入场阶段只推进对应表现动画，不推进模拟时钟与
    // 战斗；战斗阶段驱动模拟时钟前进并按当前状态刷新页面（终局后不再推进行动）。
    // 挡位放大每节拍的模拟时间与行动数：x2/x3 下同节拍推进更多行动。
    timer = setInterval(() => {
        const now = Date.now();
        if (phase === "vs") {
            // VS 阶段：渲染初始状态 + 推进覆盖层动画，模拟时钟不前进、战斗不 tick
            render();
            vsTemplate.step();
            if (now >= vsEnd) {
                phase = "entrance";
            }
            return;
        }
        if (phase === "entrance") {
            // 入场阶段：渲染初始状态 + 推进入场动画（单位淡入到位），战斗不推进
            render();
            stepEffects();
            if (now >= entranceEnd) {
                phase = "fighting";
            }
            return;
        }
        // 战斗阶段：既有逻辑
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
            vsTemplate.reset();
            renderer.dispose();
        },
    };
}
