import type { Module } from "../../../framework";
import type { AutoBattleClock } from "./clock";
import { MAX_TEAM_SIZE } from "./config";
import type { AutoBattleConfigHandle } from "./config";
import {
    applyAutoBattleDamage,
    growAutoBattleEnergy,
    resolveAutoBattleSkill,
} from "./skills";
import {
    isAutoBattleAlive,
    resolveAutoBattleTarget,
    selectAutoBattleHealTarget,
    sortAutoBattleOrder,
} from "./formation";
import {
    createMutableUnit,
    snapshotUnits,
    type MutableUnit,
} from "./units";
import { createMapGrid } from "./grid";
import type {
    AutoBattleEvent,
    AutoBattlePhase,
    AutoBattleSide,
    AutoBattleState,
} from "../models";

/** 开战编队单位：slot = 布阵区格位（0..FORMATION_GRID_SIZE-1），heroId 引用英雄池。 */
export interface AutoBattlePlacedUnit {
    readonly slot: number;
    readonly heroId: string;
}

/** 开战编队（每侧按 slot 排列的已上阵单位）。 */
export interface AutoBattleLineupPair {
    readonly ally: readonly AutoBattlePlacedUnit[];
    readonly enemy: readonly AutoBattlePlacedUnit[];
}

/**
 * 把配置初始编队（压缩 id 数组，语义 = 已上阵序）转换为 placement 格式：
 * slot 按 0..n-1 连续映射到布阵区前段格（无空槽，与玩家编队定长结构互为转换）。
 * 玩家编队（含空槽）由装配层显式构造 placement，不经此转换。
 */
export function toLineupPair(lineups: {
    readonly ally: readonly string[];
    readonly enemy: readonly string[];
}): AutoBattleLineupPair {
    const toPlacement = (ids: readonly string[]): readonly AutoBattlePlacedUnit[] =>
        ids.map((heroId, slot) => ({ slot, heroId }));
    return {
        ally: toPlacement(lineups.ally),
        enemy: toPlacement(lineups.enemy),
    };
}

/** 战斗控制器选项：时钟用于事件时间戳，事件经 onEvent 广播。 */
export interface AutoBattleBattleOptions {
    readonly clock: AutoBattleClock;
    readonly config: AutoBattleConfigHandle;
    /**
     * 开战编队（heroId 序列）；缺省用 config.lineups（初始编队）。函数形式让
     * 调用方（编队页）在玩家编辑后切换编队并重开对局。
     */
    readonly lineups?: () => AutoBattleLineupPair;
    readonly onEvent?: (event: AutoBattleEvent) => void;
}

export interface AutoBattleBattleHandle {
    readonly state: AutoBattleState;
    /** 事件回放日志：按发生顺序完整记录。 */
    readonly events: readonly AutoBattleEvent[];
    /** 单行动推进：每轮存活单位各行动一次，序列耗尽则进入下一回合。 */
    tick(): void;
    /** 重置对局到初始状态，幂等。 */
    restart(): void;
    /** 停止推进，幂等。 */
    dispose(): void;
}

/**
 * tick 驱动的自动战斗控制器：每次 tick 执行行动序列中的下一个行动；序列
 * 耗尽则轮次 +1、按存活单位速度降序重建序列。每轮 = 存活单位各行动一次。
 * 能量未满普攻（攻击者/受击者按配置增长能量），满能量释放技能（伤害对敌方
 * 前排优先目标、治疗对己方 HP 最低存活单位）并清零能量。终局判定先于后续
 * 行动：一方全灭即进入 over，tick 不再推进。事件经选项 onEvent 广播并保序
 * 记录，确定性来自速度稳定排序与纯函数结算（同输入同结果）。
 */
export function createAutoBattleBattle(
    options: AutoBattleBattleOptions,
): AutoBattleBattleHandle {
    const clock = options.clock;
    const config = options.config;
    const report = options.onEvent ?? (() => { });

    const events: AutoBattleEvent[] = [];

    let disposed = false;
    let round = 1;
    let phase: AutoBattlePhase = "fighting";
    let result: "win" | "lose" | undefined;
    let order: string[] = [];
    let actionIndex = 0;
    let seq = 0;
    let units: MutableUnit[] = [];

    function emit(event: Omit<AutoBattleEvent, "seq" | "time">): void {
        const full: AutoBattleEvent = { ...event, seq, time: clock.now() };
        seq += 1;
        events.push(full);
        report(full);
    }

    /** 开战实例化：由编队（placement：slot + heroId，缺省 config.lineups 按已上阵
     *  序映射到布阵区前段格）从英雄池展开单位快照，并把每个单位分配到己方/敌方
     *  布阵区格（slot 决定布阵出发点，index 为压缩序只用于战斗内寻址）。战斗单位
     *  是英雄池数据的只读消费副本，改动不回流配置/编队（解耦）。change 05 阶段
     *  坐标只读静态出发点，距离移动留 change 08。 */
    function resetUnits(): void {
        const grid = createMapGrid();
        units = [];
        const lineups: AutoBattleLineupPair =
            options.lineups === undefined ? toLineupPair(config.lineups) : options.lineups();
        const heroById = new Map(config.heroes.map((hero) => [hero.id, hero]));

        const placeSide = (
            side: AutoBattleSide,
            placed: readonly AutoBattlePlacedUnit[],
        ): void => {
            const cells = grid.formationCells(side);
            if (placed.length > MAX_TEAM_SIZE) {
                throw new Error(
                    `auto-battle battle: ${side} lineup must have at most ${MAX_TEAM_SIZE} units`,
                );
            }
            placed.forEach((placement, index) => {
                const { slot, heroId } = placement;
                const hero = heroById.get(heroId);
                if (hero === undefined) {
                    throw new Error(
                        `auto-battle battle: lineup references unknown hero "${heroId}"`,
                    );
                }
                if (slot < 0 || slot >= cells.length) {
                    throw new Error(
                        `auto-battle battle: ${side} slot ${slot} out of formation bounds`,
                    );
                }
                const gridKey = cells[slot]!;
                grid.place(heroId, gridKey);
                units.push(createMutableUnit({ ...hero, side, index }, gridKey));
            });
        };
        placeSide("ally", lineups.ally);
        placeSide("enemy", lineups.enemy);
    }

    function unitById(id: string): MutableUnit | undefined {
        return units.find((unit) => unit.id === id);
    }

    function sideUnits(side: AutoBattleSide): readonly MutableUnit[] {
        return units.filter((unit) => unit.side === side);
    }

    /** 终局判定：一方全灭进入 over；己方存活判胜、己方全灭判败。 */
    function checkGameOver(): boolean {
        const allyAlive = sideUnits("ally").some(isAutoBattleAlive);
        const enemyAlive = sideUnits("enemy").some(isAutoBattleAlive);
        if (allyAlive && enemyAlive) {
            return false;
        }
        phase = "over";
        result = allyAlive ? "win" : "lose";
        emit({ type: "battle-over", sourceId: "", round, result });
        return true;
    }

    /** 终局读取：经函数间接读取可变 phase，避免 TS 在 tick 内过度收窄。 */
    function isOver(): boolean {
        return phase === "over";
    }

    /** 开始一轮：轮次 +1、按存活单位速度降序快照行动序列并广播 round-start。 */
    function beginRound(nextRound: number): void {
        round = nextRound;
        order = sortAutoBattleOrder(
            snapshotUnits(units).filter(isAutoBattleAlive),
        ).map((unit) => unit.id);
        actionIndex = 0;
        emit({ type: "round-start", sourceId: "", round });
    }

    /** 普攻：对锁定目标（无锁定时前排优先）造成自身攻击力伤害，双方按配置增长能量。 */
    function basicAttack(actor: MutableUnit): void {
        const opposingSide: AutoBattleSide = actor.side === "ally" ? "enemy" : "ally";
        const target = resolveAutoBattleTarget(
            sideUnits(opposingSide),
            actor.lockedTargetId,
        ) as MutableUnit | undefined;
        // 锁定目标死亡后该行动即重选新目标并锁定（"目标死亡后顺延"在一个行动内完成）
        actor.lockedTargetId = target?.id ?? null;
        if (target === undefined) {
            // 对侧全灭：终局已由前一次行动判定，此处防御性 no-op
            return;
        }

        const outcome = applyAutoBattleDamage(target.hp, actor.def.attack);
        target.hp = outcome.hp;
        actor.energy = growAutoBattleEnergy(
            actor.energy,
            actor.def.energyMax,
            config.energyGainAttacker,
        );
        // 阵亡目标不再累计受击能量（实现收窄，测试锁定其行为）
        if (!outcome.kills) {
            target.energy = growAutoBattleEnergy(
                target.energy,
                target.def.energyMax,
                config.energyGainTarget,
            );
        }

        emit({
            type: "attack",
            sourceId: actor.id,
            targetId: target.id,
            value: outcome.applied,
            round,
        });

        if (outcome.kills) {
            emit({ type: "unit-dead", sourceId: actor.id, targetId: target.id, round });
            checkGameOver();
        }
    }

    /** 满能量释放技能：结算统一走 resolveAutoBattleSkill，避免规则多实现。 */
    function castSkill(actor: MutableUnit): void {
        const skill = actor.def.skill;
        if (skill.kind === "damage") {
            const opposingSide: AutoBattleSide = actor.side === "ally" ? "enemy" : "ally";
            const target = resolveAutoBattleTarget(
                sideUnits(opposingSide),
                actor.lockedTargetId,
            ) as MutableUnit | undefined;
            // 伤害技能与普攻共用锁定语义：目标死亡后该行动即重选并锁定
            actor.lockedTargetId = target?.id ?? null;
            if (target === undefined) {
                return;
            }
            const effect = resolveAutoBattleSkill(skill, target.hp, target.maxHp);
            if (effect.kind === "damage") {
                target.hp = effect.hp;
                actor.energy = 0;
                emit({
                    type: "skill-damage",
                    sourceId: actor.id,
                    targetId: target.id,
                    value: effect.applied,
                    round,
                });
                if (effect.kills) {
                    emit({ type: "unit-dead", sourceId: actor.id, targetId: target.id, round });
                    checkGameOver();
                }
            }
            return;
        }

        const target = selectAutoBattleHealTarget(sideUnits(actor.side)) as
            | MutableUnit
            | undefined;
        if (target === undefined) {
            return;
        }
        const effect = resolveAutoBattleSkill(skill, target.hp, target.maxHp);
        if (effect.kind === "heal") {
            target.hp = effect.hp;
            actor.energy = 0;
            emit({
                type: "skill-heal",
                sourceId: actor.id,
                targetId: target.id,
                value: effect.applied,
                round,
            });
        }
    }

    function act(actor: MutableUnit): void {
        if (actor.energy >= actor.def.skill.energyCost) {
            castSkill(actor);
            return;
        }
        basicAttack(actor);
    }

    // 构造即就绪：从配置初始化单位阵列并开启第 1 回合（广播 round-start），
    // 使首次 tick 即可消费已构建的行动序列；若开战即有一方为空（空编队），
    // 立即进入终局（不开启回合，避免战斗永远僵持在 fighting）
    resetUnits();
    if (!checkGameOver()) {
        beginRound(1);
    }

    return {
        get state(): AutoBattleState {
            return {
                round,
                phase,
                order: [...order],
                actionIndex,
                result,
                units: snapshotUnits(units),
            };
        },
        get events(): readonly AutoBattleEvent[] {
            return events;
        },
        tick(): void {
            if (disposed || isOver()) {
                return;
            }
            if (actionIndex >= order.length) {
                beginRound(round + 1);
            }
            const actor = unitById(order[actionIndex]);
            // 行动中阵亡的单位跳过：不重排序列，保证该轮次序固定
            if (actor !== undefined && actor.hp > 0) {
                act(actor);
            }
            if (!isOver()) {
                actionIndex += 1;
            }
        },
        restart(): void {
            if (disposed) {
                return;
            }
            resetUnits();
            round = 1;
            phase = "fighting";
            result = undefined;
            order = [];
            actionIndex = 0;
            // 重开即新对局：清空事件日志与序号，避免旧对局日志残留
            events.length = 0;
            seq = 0;
            emit({ type: "restart", sourceId: "" });
            // 空编队重开同样立即终局（不开启回合）
            if (!checkGameOver()) {
                beginRound(1);
            }
        },
        dispose(): void {
            if (disposed) {
                return;
            }
            disposed = true;
        },
    };
}

/**
 * 战斗模块：组合根创建战斗控制器并注入；模块只登记引用，不在此释放共享
 * 控制器——组合根的 dispose 统一负责（对齐 GameFixture 幂等契约）。
 */
export function createAutoBattleBattleModule(
    battle: AutoBattleBattleHandle,
): Module {
    return {
        id: "auto_battle.battle",
        dependencies: [],
        start: () => {
            // 控制器在组合根构造时即就绪；start 只是让模块进入装配清单
            void battle.state.round;
        },
    };
}
