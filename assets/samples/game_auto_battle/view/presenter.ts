import type { IViewModelNode } from "../../../framework";
import { createViewModelRenderer, GameClock } from "../../../framework";
import type { GameFixture } from "../../../game/fixture/GameFixture";
import type { GamePresenter } from "../../../game/lobby/presenter";
import type { AutoBattleFixture } from "../assembly";
import type { AutoBattleEvent, AutoBattleSide } from "../models";
import { text } from "../../../game-content/generated/i18n";
import { buildUnitAnimationFrames, WARRIOR_VARIANT_BY_SIDE, type WarriorAnim } from "./animUrls";
import { projectHitFeedbackEvents } from "./effects";
import { createEffectAnimator } from "./EffectAnimator";
import { createUnitAnimator } from "./UnitAnimator";
import { createVsEntranceTemplate } from "./VsEntrance";
import { createPixelHudAnimator } from "./PixelHudAnimator";
import { BATTLE_SCANLINES_NODE } from "./UiNodes";
import { buildAutoBattleBindings, createAutoBattleViewModel, formatAutoBattleEvent, gridToXY, type AutoBattleCommands, type AutoBattleViewModel } from "./view";

/** VS 阶段子时长（ms）：入场（武将向中心+淡入）→ 定格 → 淡出。 */
const VS_ENTRANCE_MS = 550;
const VS_HOLD_MS = 300;
const VS_FADE_MS = 150;
/** VS 阶段总时长（ms）：覆盖入场+定格+淡出全程，让 VS 覆盖层完整演完（约 1s）。 */
const VS_PHASE_MS = VS_ENTRANCE_MS + VS_HOLD_MS + VS_FADE_MS;
/** 入场阶段时长（ms）：战斗开始后先展示单位入场，期间不推进战斗。 */
const ENTRANCE_PHASE_MS = 750;
/** 单回合最低表现窗口；技能与死亡按事件类型获得更长的不可覆盖时间。 */
const ACTION_PRESENTATION_MS = 900;
const SKILL_PRESENTATION_MS = 1600;
const DEATH_PRESENTATION_MS = 2100;

/** 根据一次逻辑 tick 新增的事件计算下一次行动前必须保留的表现窗口。 */
export function actionPresentationWindowMs(events: readonly AutoBattleEvent[]): number {
    if (events.some((event) => event.type === "unit-dead")) {
        return DEATH_PRESENTATION_MS;
    }
    if (events.some((event) => event.type === "skill-damage" || event.type === "skill-heal")) {
        return SKILL_PRESENTATION_MS;
    }
    return ACTION_PRESENTATION_MS;
}

/** 墙钟回拨时不向表现时钟传入负增量，下一 tick 仍以新的墙钟为基准恢复。 */
export function clampPresentationElapsed(elapsed: number): number {
    return Math.max(0, elapsed);
}

/** 呈现器驱动接缝选项：测试可注入自增墙钟与手动驱动，确定性推进阶段与战斗节拍。 */
export interface AutoBattlePresenterOptions {
    /** 墙钟读数；缺省 Date.now。 */
    readonly now?: () => number;
    /** 驱动循环；缺省 50ms setInterval，可完整采样最短 50ms 动作帧。 */
    readonly drive?: (tick: () => void) => { readonly dispose: () => void };
}

/**
 * 自动战斗战场呈现器：把 auto_battle 夹具战斗状态绑定到 BattleView 节点。
 * 三阶段状态机：VS 展示（VS_PHASE_MS，只推进入场覆盖层动画）→ 单位入场
 * （ENTRANCE_PHASE_MS，只渲染并推进单位淡入动画）→ 战斗（固定节拍驱动模拟
 * 时钟前进并逐行动 tick，每 tick 一个行动）。VS 与入场阶段不推进模拟时钟与
 * 战斗行动。挡位只改变驱动节拍：GameClock.rate = 挡位倍率，按倍率放大表现
 * 时间推进量，不改 tick 内容与战斗结果；动画 timeSource 注入 GameClock（表现
 * 时间统一控制，动画跟随倍速）。命中反馈与位移动画作为事件增量叠加在 state
 * 渲染之上（每帧投影 → play → step），动画终态回到 state 姿态。restart 重置
 * 回 VS 阶段并重放覆盖层。dispose 清理渲染器、动画器、VS 覆盖层与时钟驱动。
 */
export function createAutoBattlePresenter(fixture: GameFixture, node: (name: string) => IViewModelNode | undefined, options: AutoBattlePresenterOptions = {}): GamePresenter {
    const autoBattle = fixture as AutoBattleFixture;
    const now = options.now ?? (() => Date.now());
    // 驱动循环接缝：缺省 50ms setInterval；测试注入手动驱动（对齐 DevOverlay drive 模式）
    const drive =
        options.drive ??
        ((tick) => {
            const timer = setInterval(tick, 50);
            return { dispose: () => clearInterval(timer) };
        });

    // 表现时间控制点：动画/阶段/驱动节拍的统一时间源（全局 rate/pause/jump 经它控制）。
    // 动画器只读 now()，倍速语义由 GameClock.rate 承担（动画跟随倍速，ADR-029 C-13）。
    const gameClock = new GameClock();
    const hudAnimator = createPixelHudAnimator({
        timeSource: gameClock,
        node,
        scanlineNode: BATTLE_SCANLINES_NODE,
    });
    let lastWallTime = now();
    // 特效投影游标：记录已消费事件序号，只对新事件投影（增量、幂等）
    let effectCursor = -1;
    // 三阶段状态机：vs → entrance → fighting；阶段切换时间戳用 GameClock
    // （与动画时间源同源），vs/entrance 阶段只推进对应表现动画不推进战斗
    type PresenterPhase = "vs" | "entrance" | "fighting";
    let phase: PresenterPhase = "vs";
    let vsEnd = 0;
    let entranceEnd = 0;
    let nextBattleActionAt = 0;

    /** 重置阶段时间戳到当前时刻：创建与 restart 共用，保证 restart 重演完整 VS 阶段。 */
    function beginVsPhase(): void {
        const now = gameClock.now();
        vsEnd = now + VS_PHASE_MS;
        entranceEnd = vsEnd + ENTRANCE_PHASE_MS;
        nextBattleActionAt = entranceEnd;
    }
    beginVsPhase();
    // 命中反馈动画器：节点解析复用渲染器节点，时间源注入 GameClock（表现时间，
    // 动画跟随倍速）；单位绝对坐标由 state 查 gridKey 经 gridToXY 推导
    const effectAnimator = createEffectAnimator({
        node: (name: string) => node(name),
        timeSource: () => gameClock.now(),
        homeXYOf: (unitId: string) => {
            const unit = autoBattle.battle.state.units.find((candidate) => candidate.id === unitId);
            return unit === undefined ? { x: 0, y: 0 } : gridToXY(unit.gridKey);
        },
        gridXYOf: (gridKey: string) => gridToXY(gridKey),
    });
    // 单位形象动画器：存活单位持续循环 idle，attack/death 意图一次性切换后转场。
    // 变体按单位阵营映射（己方 f / 敌方 m，向后兼容无表配置）；当配置提供
    // unitAnimations 表且单位有 animationId 时，帧 URL 走表驱动（buildUnitAnimationFrames）。
    // 存活集合从 state 每帧派生
    const animationsById = new Map(autoBattle.config.unitAnimations.map((entry) => [entry.id, entry]));
    const unitAnimator = createUnitAnimator({
        node: (name: string) => node(name),
        timeSource: () => gameClock.now(),
        variantOf: (unitId: string) => {
            const unit = autoBattle.battle.state.units.find((candidate) => candidate.id === unitId);
            return unit === undefined ? "f" : (WARRIOR_VARIANT_BY_SIDE[unit.side] ?? "f");
        },
        liveUnitIds: () => autoBattle.battle.state.units.filter((unit) => unit.hp > 0).map((unit) => unit.id),
        // 表驱动帧解析：单位 animationId → unitAnimations 表条目 → 帧 URL 序列
        frameUrlsOf: (unitId: string): Readonly<Record<WarriorAnim, readonly string[]>> | undefined => {
            const unit = autoBattle.battle.state.units.find((candidate) => candidate.id === unitId);
            const animationId = unit?.animationId;
            if (animationId === undefined) {
                return undefined;
            }
            const animation = animationsById.get(animationId);
            return animation === undefined ? undefined : buildUnitAnimationFrames(animation);
        },
        frameMsOf: (unitId: string, anim: WarriorAnim): number | undefined => {
            const unit = autoBattle.battle.state.units.find((candidate) => candidate.id === unitId);
            const animationId = unit?.animationId;
            return animationId === undefined ? undefined : animationsById.get(animationId)?.frameMsByAnim[anim];
        },
    });

    /** 每方队长：index 最小存活单位（VS 覆盖层展示用，纯读取 state）。 */
    function leaderOf(side: AutoBattleSide): string {
        const leaders = autoBattle.battle.state.units.filter((unit) => unit.side === side && unit.hp > 0).sort((a, b) => a.index - b.index);
        const leader = leaders[0];
        return leader === undefined ? "" : text.getOr(leader.name, leader.name);
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
            unitAnimator.reset();
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
        const nameOf = (id: string): string => {
            const unit = state.units.find((candidate) => candidate.id === id);
            return unit === undefined ? id : text.getOr(unit.name, unit.name);
        };
        const log = autoBattle.battle.events.map((event) => formatAutoBattleEvent(event, nameOf));
        const vm = createAutoBattleViewModel(state, log, autoBattle.getSpeed());
        renderer.setBindings(buildAutoBattleBindings(autoBattleCommands, vm));
        renderer.setViewModel(vm);
    }

    /** 每帧推进命中反馈：投影新事件为特效意图并推进动画。 */
    function stepEffects(): void {
        // 技能专属动效表：effectId → 动效定义（表驱动投影，缺省表为空则回退旧投影）
        const skillEffectsById = new Map(autoBattle.config.skillEffects.map((entry) => [entry.id, entry]));
        const resolveSkillEffect = (effectId: string) => skillEffectsById.get(effectId);
        const { effects, cursor } = projectHitFeedbackEvents(autoBattle.battle.events, effectCursor, resolveSkillEffect);
        effectCursor = cursor;
        // 一次性反馈特效（飘字/闪白/爆炸）走 EffectAnimator；单位形象动画意图
        // 经 UnitAnimator 消费（idle 由 step 持续循环，attack/death 一次性切换）
        effectAnimator.play(effects);
        effectAnimator.step();
        unitAnimator.play(effects);
        unitAnimator.step();
    }

    // 固定节拍按阶段分发：VS/入场阶段只推进对应表现动画，不推进模拟时钟与
    // 战斗；战斗阶段驱动模拟时钟前进并按当前状态刷新页面（终局后不再推进行动）。
    // GameClock 是被动时钟：每帧用真实经过时间 advance（按 rate 缩放推进），
    // 使阶段切换/动画/战斗节拍都随真实时间流动。rate 放大表现时间推进量（挡位
    // 倍率）；模拟时钟（AutoBattleClock 自持 timeScale）以同一原始墙钟增量
    // advance，由它内部自乘一次倍率——绝不把已含倍率的 GameClock delta 再传给
    // 模拟时钟，否则事件时间戳按 speed² 膨胀、与实际 tick 量不一致（时序一致性）。
    const driveHandle = drive(() => {
        const wallNow = now();
        const wallDelta = clampPresentationElapsed(wallNow - lastWallTime);
        lastWallTime = wallNow;
        gameClock.advance(wallDelta);
        hudAnimator.step();
        const gameNow = gameClock.now();
        if (phase === "vs") {
            // VS 阶段：渲染初始状态 + 推进覆盖层动画，模拟时钟不前进、战斗不 tick
            render();
            vsTemplate.step();
            if (gameNow >= vsEnd) {
                phase = "entrance";
            }
            return;
        }
        if (phase === "entrance") {
            // 入场阶段：渲染初始状态 + 推进入场动画（单位淡入到位），战斗不推进
            render();
            stepEffects();
            if (gameNow >= entranceEnd) {
                phase = "fighting";
            }
            return;
        }
        // 战斗阶段持续推进模拟时钟，但只有上一行动的表现窗口结束后才执行下一次
        // 逻辑 tick。窗口使用 GameClock 时间，因此 0.5x/2x/3x 会线性缩放等待，
        // 不再通过每个 50ms 驱动连续覆盖攻击、受击与死亡动画。
        autoBattle.clock.advance(wallDelta);
        if (autoBattle.battle.state.phase === "fighting" && gameNow >= nextBattleActionAt) {
            const previousEventCount = autoBattle.battle.events.length;
            autoBattle.battle.tick();
            const emitted = autoBattle.battle.events.slice(previousEventCount);
            nextBattleActionAt = gameNow + actionPresentationWindowMs(emitted);
        }
        render();
        stepEffects();
    });

    render();

    return {
        render,
        dispose: () => {
            driveHandle.dispose();
            hudAnimator.dispose();
            effectAnimator.reset();
            unitAnimator.reset();
            vsTemplate.reset();
            renderer.dispose();
        },
    };
}
