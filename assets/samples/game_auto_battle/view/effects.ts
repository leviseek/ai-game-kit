import type { Module } from "../../../framework";
import type { AutoBattleEvent } from "../models";

/**
 * 命中反馈与位移动画意图：由战斗事件投影（event projection）派生，是引擎无关的
 * 纯数据——presenter/动画器据此驱动飘字、闪白、抖动、位移、入场，不进入逻辑层。
 */
export type HitFeedbackEffect =
    | { readonly kind: "damage-float"; readonly unitId: string; readonly value: number; readonly seq: number }
    | { readonly kind: "heal-float"; readonly unitId: string; readonly value: number; readonly seq: number }
    | { readonly kind: "hit-flash"; readonly unitId: string; readonly seq: number }
    | { readonly kind: "move"; readonly unitId: string; readonly fromGrid: string; readonly toGrid: string; readonly seq: number }
    | { readonly kind: "teleport"; readonly unitId: string; readonly toGrid: string; readonly seq: number }
    | { readonly kind: "entrance"; readonly unitId: string; readonly seq: number };

/**
 * 事件 → 特效投影：把战斗事件映射为特效意图列表。
 * - attack / skill-damage → 伤害飘字 + 受击闪白/抖动 + 攻击者前冲（由 hit-flash 抖动覆盖）
 * - skill-heal → 治疗飘字（不闪白/抖动）
 * - move → 位移插值意图（from→to 网格）
 * - teleport → 瞬移意图（跳变到 to 网格）
 * - round-start → 入场意图（开战/每轮首事件，单位淡入到位）
 * - unit-dead 及其它事件 → 不产生特效
 * 纯函数无副作用，返回新游标；调用方（presenter）保存游标以增量消费。
 */
export function projectHitFeedbackEvents(events: readonly AutoBattleEvent[], cursor: number): { readonly effects: readonly HitFeedbackEffect[]; readonly cursor: number } {
    const effects: HitFeedbackEffect[] = [];
    let next = cursor;

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
        } else if (event.type === "skill-heal") {
            effects.push({
                kind: "heal-float",
                unitId: event.targetId,
                value: event.value ?? 0,
                seq: event.seq,
            });
        }
    }

    return { effects, cursor: next };
}

/**
 * 特效投影模块：投影为纯函数，模块只登记引用使其进入装配清单，
 * 生命周期无副作用（对齐 formation/skills 纯函数模块登记语义）。
 */
export function createAutoBattleEffectsModule(): Module {
    return {
        id: "auto_battle.effects",
        dependencies: [],
        start: () => {
            // 纯函数模块无共享状态；start 只是让模块进入装配清单
            void projectHitFeedbackEvents;
        },
    };
}
