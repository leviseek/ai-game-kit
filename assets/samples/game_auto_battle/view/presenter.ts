import type { ViewModelNode } from "../../../framework";
import { createViewModelRenderer, GameClock } from "../../../framework";
import type { GameFixture } from "../../../game/fixture/GameFixture";
import type { GamePresenter } from "../../../game/lobby/presenter";
import type { AutoBattleFixture } from "../assembly";
import type { AutoBattleSide } from "../models";
import { projectHitFeedbackEvents } from "./effects";
import { createEffectAnimator } from "./EffectAnimator";
import { createVsEntranceTemplate } from "./VsEntrance";
import {
    buildAutoBattleBindings,
    createAutoBattleViewModel,
    formatAutoBattleEvent,
    gridToXY,
    type AutoBattleCommands,
    type AutoBattleViewModel,
} from "./view";

/** VS 阶段子时长（ms）：入场（武将向中心+淡入）→ 定格 → 淡出。 */
const VS_ENTRANCE_MS = 550;
const VS_HOLD_MS = 300;
const VS_FADE_MS = 150;
/** VS 阶段总时长（ms）：覆盖入场+定格+淡出全程，让 VS 覆盖层完整演完（约 1s）。 */
const VS_PHASE_MS = VS_ENTRANCE_MS + VS_HOLD_MS + VS_FADE_MS;
/** 入场阶段时长（ms）：战斗开始后先展示单位入场，期间不推进战斗。 */
const ENTRANCE_PHASE_MS = 750;

/**
 * 自动战斗战场呈现器：把 auto_battle 夹具战斗状态绑定到 BattleView 节点。
 * 三阶段状态机：VS 展示（VS_PHASE_MS，只推进入场覆盖层动画）→ 单位入场
 * （ENTRANCE_PHASE_MS，只渲染并推进单位淡入动画）→ 战斗（固定节拍驱动模拟
 * 时钟前进并逐行动 tick，每 tick 一个行动）。VS 与入场阶段不推进模拟时钟与
 * 战斗行动。挡位只改变驱动节拍：GameClock.rate = 挡位倍率，按倍率放大模拟
 * 时间推进量，不改 tick 内容与战斗结果；动画 timeSource 注入 GameClock（表现
 * 时间统一控制，动画跟随倍速）。命中反馈与位移动画作为事件增量叠加在 state
 * 渲染之上（每帧投影 → play → step），动画终态回到 state 姿态。restart 重置
 * 回 VS 阶段并重放覆盖层。dispose 清理渲染器、动画器、VS 覆盖层与时钟驱动。
 */
export function createAutoBattlePresenter(
    fixture: GameFixture,
    node: (name: string) => ViewModelNode | undefined,
): GamePresenter {
    const autoBattle = fixture as AutoBattleFixture;

    // 表现时间控制点：动画/阶段/驱动节拍的统一时间源（全局 rate/pause/jump 经它控制）。
    // 动画器只读 now()，倍速语义由 GameClock.rate 承担（动画跟随倍速，ADR-029 C-13）。
    const gameClock = new GameClock();
    let lastWallTime = Date.now();
    let lastGameNow = gameClock.now();
    let timer: ReturnType<typeof setInterval> | undefined;
    // 特效投影游标：记录已消费事件序号，只对新事件投影（增量、幂等）
    let effectCursor = -1;
    // 三阶段状态机：vs → entrance → fighting；阶段切换时间戳用 GameClock
    // （与动画时间源同源），vs/entrance 阶段只推进对应表现动画不推进战斗
    type PresenterPhase = "vs" | "entrance" | "fighting";
    let phase: PresenterPhase = "vs";
    let vsEnd = 0;
    let entranceEnd = 0;

    /** 重置阶段时间戳到当前时刻：创建与 restart 共用，保证 restart 重演完整 VS 阶段。 */
    function beginVsPhase(): void {
        const now = gameClock.now();
        vsEnd = now + VS_PHASE_MS;
        entranceEnd = vsEnd + ENTRANCE_PHASE_MS;
    }
    beginVsPhase();
    // 命中反馈动画器：节点解析复用渲染器节点，时间源注入 GameClock（表现时间，
    // 动画跟随倍速）；单位绝对坐标由 state 查 gridKey 经 gridToXY 推导
    const effectAnimator = createEffectAnimator({
        node: (name: string) => node(name),
        timeSource: () => gameClock.now(),
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

    // VS 覆盖层：左右队长名 + VS 大字；时间源注入 GameClock（与阶段状态机同源）。
    // 阶段时长取 entrance+hold+fade 之和（durationMs 只含入场移动+淡入，
    // hold 为入场后定格、fade 为整体淡出）。
    const vsTemplate = createVsEntranceTemplate({
        node: (name: string) => node(name),
        timeSource: () => gameClock.now(),
        config: {
            left: {
                name: leaderOf("enemy"),
                sideLabel: "敌方",
                // 左侧武将目标坐标（1280x720 画布，y 垂直居中）；动画从屏外收敛到该坐标
                baseXY: { x: 100, y: 360 },
            },
            right: {
                name: leaderOf("ally"),
                sideLabel: "己方",
                baseXY: { x: 980, y: 360 },
            },
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
            // 驱动节拍统一读 fixture.getSpeed()。GameClock.rate 同步挡位倍率，
            // 使动画时间源跟随倍速（表现时间统一控制）
            autoBattle.cycleSpeed();
            gameClock.setTimeScale(autoBattle.getSpeed());
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
    // GameClock 是被动时钟：每帧用真实经过时间 advance（按 rate 缩放推进），
    // 使阶段切换/动画/战斗节拍都随真实时间流动；rate 放大模拟时间推进量（挡位
    // 倍率），替代"每 interval 推多次"。
    timer = setInterval(() => {
        const wallNow = Date.now();
        gameClock.advance(wallNow - lastWallTime);
        lastWallTime = wallNow;
        const now = gameClock.now();
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
        // 战斗阶段：GameClock 增量驱动模拟时钟（rate 已含倍率，tick 次数随挡位匹配节奏）
        const delta = now - lastGameNow;
        lastGameNow = now;
        autoBattle.clock.advance(delta);
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
