import type { IModule } from "../../../framework";
import type { AutoBattleAnimName, AutoBattleEvent, AutoBattleSkillEffectDef } from "../models";

/**
 * 命中反馈与位移动画意图：由战斗事件投影（event projection）派生，是引擎无关的
 * 纯数据——presenter/动画器据此驱动飘字、闪白、抖动、位移、入场、爆炸、单位形象，
 * 不进入逻辑层。
 */
export type HitFeedbackEffect =
    | { readonly kind: "damage-float"; readonly unitId: string; readonly value: number; readonly seq: number }
    | { readonly kind: "heal-float"; readonly unitId: string; readonly value: number; readonly seq: number }
    | { readonly kind: "hit-flash"; readonly unitId: string; readonly seq: number }
    | { readonly kind: "move"; readonly unitId: string; readonly fromGrid: string; readonly toGrid: string; readonly seq: number }
    | { readonly kind: "teleport"; readonly unitId: string; readonly toGrid: string; readonly seq: number }
    | { readonly kind: "entrance"; readonly unitId: string; readonly seq: number }
    | { readonly kind: "explosion"; readonly unitId: string; readonly seq: number }
    | { readonly kind: "unit-anim"; readonly unitId: string; readonly anim: AutoBattleAnimName; readonly nextAnim?: AutoBattleAnimName; readonly seq: number };

/**
 * 事件 → 特效投影：把战斗事件映射为特效意图列表。
 * - attack / skill-damage → 伤害飘字 + 受击闪白/抖动 + 攻击者前冲（由 hit-flash 抖动覆盖）
 * - skill-heal → 治疗飘字（不闪白/抖动）
 * - move → 位移插值意图（from→to 网格）
 * - teleport → 瞬移意图（跳变到 to 网格）
 * - round-start → 入场意图（开战/每轮首事件，单位淡入到位）
 * - attack / skill-damage / skill-heal → 攻击/施法者播放攻击帧（unit-anim attack）
 * - unit-dead → 死亡爆炸（explosion）+ 目标播放死亡帧（unit-anim death）
 * - 其它事件 → 不产生特效
 * 可选动效表解析器（resolveSkillEffect）：事件携带 effectId 且表能解析出条目时，
 * 按表条目追加专属动效（表驱动增量；缺省不传保持旧投影行为，向后兼容）。
 * 纯函数无副作用，返回新游标；调用方（presenter）保存游标以增量消费。
 */
export function projectHitFeedbackEvents(
    events: readonly AutoBattleEvent[],
    cursor: number,
    resolveSkillEffect?: (effectId: string) => AutoBattleSkillEffectDef | undefined,
): { readonly effects: readonly HitFeedbackEffect[]; readonly cursor: number } {
    const effects: HitFeedbackEffect[] = [];
    let next = cursor;

    /** 技能专属动效投影：按动效表条目向目标追加视觉意图。 */
    function projectSkillEffect(event: AutoBattleEvent, targetId: string): void {
        if (event.effectId === undefined || resolveSkillEffect === undefined) {
            return;
        }
        const effectDef = resolveSkillEffect(event.effectId);
        if (effectDef === undefined) {
            return;
        }
        if (effectDef.kind === "explosion") {
            effects.push({ kind: "explosion", unitId: targetId, seq: event.seq });
        } else if (effectDef.kind === "flash") {
            effects.push({ kind: "hit-flash", unitId: targetId, seq: event.seq });
        } else if (effectDef.kind === "float") {
            effects.push({ kind: "damage-float", unitId: targetId, value: event.value ?? 0, seq: event.seq });
        }
    }

    for (const event of events) {
        if (event.seq <= cursor) {
            continue;
        }
        next = Math.max(next, event.seq);

        if (event.type === "round-start") {
            // 入场：战斗开始（首轮）时各存活单位淡入到位；仅首轮触发避免每轮重复
            if (event.round === 1 && event.sourceId === "") {
                for (const unitId of event.unitIds ?? []) {
                    effects.push({ kind: "entrance", unitId, seq: event.seq });
                }
            }
            continue;
        }
        if (event.type === "move") {
            if (event.sourceId !== "" && event.fromGridKey !== undefined && event.toGridKey !== undefined) {
                effects.push({
                    kind: "move",
                    unitId: event.sourceId,
                    fromGrid: event.fromGridKey,
                    toGrid: event.toGridKey,
                    seq: event.seq,
                });
                effects.push({ kind: "unit-anim", unitId: event.sourceId, anim: "walk", seq: event.seq });
            }
            continue;
        }
        if (event.type === "teleport") {
            if (event.sourceId !== "" && event.toGridKey !== undefined) {
                effects.push({
                    kind: "teleport",
                    unitId: event.sourceId,
                    toGrid: event.toGridKey,
                    seq: event.seq,
                });
            }
            continue;
        }
        if (event.type === "unit-dead") {
            // 阵亡：目标位播放爆炸序列帧 + 目标播放死亡动画（播完隐去）
            if (event.targetId !== undefined) {
                effects.push({ kind: "explosion", unitId: event.targetId, seq: event.seq });
                effects.push({ kind: "unit-anim", unitId: event.targetId, anim: "death", seq: event.seq });
            }
            continue;
        }
        if (event.targetId === undefined) {
            continue;
        }
        if (event.type === "attack" || event.type === "skill-damage") {
            effects.push({
                kind: "damage-float",
                unitId: event.targetId,
                value: event.value ?? 0,
                seq: event.seq,
            });
            effects.push({
                kind: "hit-flash",
                unitId: event.targetId,
                seq: event.seq,
            });
            effects.push({ kind: "unit-anim", unitId: event.targetId, anim: "hit", seq: event.seq });
            if (event.sourceId !== "") {
                if (event.type === "attack") {
                    effects.push({ kind: "unit-anim", unitId: event.sourceId, anim: "attack", seq: event.seq });
                } else {
                    // 技能先播放抬手，再自动衔接重劈命中段。
                    effects.push({ kind: "unit-anim", unitId: event.sourceId, anim: "skillRaise", nextAnim: "slash", seq: event.seq });
                }
            }
            // 技能专属动效：按动效表增量追加（表驱动）
            projectSkillEffect(event, event.targetId);
        } else if (event.type === "skill-heal") {
            effects.push({
                kind: "heal-float",
                unitId: event.targetId,
                value: event.value ?? 0,
                seq: event.seq,
            });
            if (event.sourceId !== "") {
                effects.push({ kind: "unit-anim", unitId: event.sourceId, anim: "skillRaise", seq: event.seq });
            }
            projectSkillEffect(event, event.targetId);
        }
    }

    return { effects, cursor: next };
}

/**
 * 特效投影模块：投影为纯函数，模块只登记引用使其进入装配清单，
 * 生命周期无副作用（对齐 formation/skills 纯函数模块登记语义）。
 */
export function createAutoBattleEffectsModule(): IModule {
    return {
        id: "auto_battle.effects",
        dependencies: [],
        start: () => {
            // 纯函数模块无共享状态；start 只是让模块进入装配清单
            void projectHitFeedbackEvents;
        },
    };
}
