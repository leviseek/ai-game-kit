import type { IModule } from "../../../framework";
import type { AutoBattleClock } from "./clock";
import { MAX_TEAM_SIZE } from "./config";
import type { AutoBattleConfigHandle } from "./config";
import { applyAutoBattleDamage, growAutoBattleEnergy, resolveAutoBattleSkill } from "./skills";
import { isAutoBattleAlive, resolveAutoBattleTarget, selectAutoBattleHealTarget, sortAutoBattleOrder } from "./formation";
import { applyAutoBattleBuffTick, autoBattleBuffAttackBonus, autoBattleBuffDefenseBonus, createAutoBattleBuffInstance, tickAutoBattleBuffs } from "./buffs";
import { resolveAutoBattleSkillCondition } from "./conditions";
import { createMutableUnit, snapshotUnits, type MutableUnit } from "./units";
import { createMapGrid, formationSlotOf } from "./grid";
import { manhattanDistance, resolveMovePath } from "./move";
import { defaultDeploymentSlot } from "./lineup";
import type { AutoBattleEvent, AutoBattlePhase, AutoBattleSide, AutoBattleState, AutoBattleSkillTarget } from "../models";

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
 * slot 按默认布阵策略（前排贴中线优先竖排，见 defaultDeploymentSlot）映射到
 * 布阵区格（无空槽，与玩家编队定长结构互为转换）。玩家编队（含空槽）由装配层
 * 显式构造 placement，不经此转换。
 */
export function toLineupPair(lineups: { readonly ally: readonly string[]; readonly enemy: readonly string[] }): AutoBattleLineupPair {
    const toPlacement = (side: AutoBattleSide, ids: readonly string[]): readonly AutoBattlePlacedUnit[] =>
        ids.map((heroId, index) => ({ slot: defaultDeploymentSlot(side, index), heroId }));
    return {
        ally: toPlacement("ally", lineups.ally),
        enemy: toPlacement("enemy", lineups.enemy),
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
export function createAutoBattleBattle(options: AutoBattleBattleOptions): AutoBattleBattleHandle {
    const clock = options.clock;
    const config = options.config;
    const report = options.onEvent ?? (() => {});

    const events: AutoBattleEvent[] = [];

    let disposed = false;
    let round = 1;
    let phase: AutoBattlePhase = "fighting";
    let result: "win" | "lose" | undefined;
    let order: string[] = [];
    let actionIndex = 0;
    let seq = 0;
    let units: MutableUnit[] = [];
    // 战场网格（占用表 + 单位当前位置）：逻辑层持有并更新（坐标真源），
    // resetUnits 重建、move/teleport 更新。渲染经 gridToXY 单向消费。
    let grid: ReturnType<typeof createMapGrid> = createMapGrid();

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
     *  坐标只读静态出发点，change 08 起逻辑层持有并更新（move/teleport）。 */
    function resetUnits(): void {
        grid = createMapGrid();
        units = [];
        const lineups: AutoBattleLineupPair = options.lineups === undefined ? toLineupPair(config.lineups) : options.lineups();
        const heroById = new Map(config.heroes.map((hero) => [hero.id, hero]));

        const placeSide = (side: AutoBattleSide, placed: readonly AutoBattlePlacedUnit[]): void => {
            const cells = grid.formationCells(side);
            if (placed.length > MAX_TEAM_SIZE) {
                throw new Error(`auto-battle battle: ${side} lineup must have at most ${MAX_TEAM_SIZE} units`);
            }
            placed.forEach((placement, index) => {
                const { slot, heroId } = placement;
                const hero = heroById.get(heroId);
                if (hero === undefined) {
                    throw new Error(`auto-battle battle: lineup references unknown hero "${heroId}"`);
                }
                if (slot < 0 || slot >= cells.length) {
                    throw new Error(`auto-battle battle: ${side} slot ${slot} out of formation bounds`);
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

    /** 开始一轮：轮次 +1、先结算挂载 buff（DoT/HoT 与到期），按存活单位速度降序快照行动序列并广播 round-start。 */
    function beginRound(nextRound: number): void {
        round = nextRound;
        // 回合开始结算挂载 buff：持续伤害/治疗先结算 HP，再递减剩余回合并移除到期 buff
        tickRoundBuffs();
        // buff 结算可能致死并触发终局：终局后不再开启回合（对齐"终局后 tick 不推进"契约）
        if (isOver()) {
            return;
        }
        order = sortAutoBattleOrder(snapshotUnits(units).filter(isAutoBattleAlive)).map((unit) => unit.id);
        actionIndex = 0;
        emit({
            type: "round-start",
            sourceId: "",
            round,
            // 存活单位 id 列表：供表现层入场动画消费（首轮）
            unitIds: snapshotUnits(units)
                .filter(isAutoBattleAlive)
                .map((unit) => unit.id),
        });
    }

    /** 回合开始 buff 结算：对全部单位执行 DoT/HoT 并递减/移除到期 buff。 */
    function tickRoundBuffs(): void {
        for (const unit of units) {
            if (unit.hp <= 0 || unit.buffs.length === 0) {
                continue;
            }
            let hp = unit.hp;
            for (const instance of unit.buffs) {
                const outcome = applyAutoBattleBuffTick(instance.def, hp, unit.maxHp);
                hp = outcome.hp;
            }
            unit.hp = hp;
            unit.buffs = [...tickAutoBattleBuffs(unit.buffs)];
            if (unit.hp <= 0) {
                emit({ type: "unit-dead", sourceId: "", targetId: unit.id, round });
            }
        }
        if (units.some((unit) => unit.hp <= 0)) {
            checkGameOver();
        }
    }

    /**
     * 行动前向目标移动：解析移动路径（超射程按 movePoints 逐格前移），逐格执行
     * grid.move 并广播 move 事件、更新单位 gridKey。射程内/无法移动时不产生 move
     * 事件。移动消耗能量（≈ 回合恢复量 × energyMoveCostRatio，下限 1）。返回是否
     * 发生移动（供调用方判断"移动 + 普攻"两阶段的移动阶段）。
     */
    function moveTowardTarget(actor: MutableUnit, target: MutableUnit): boolean {
        const { steps } = resolveMovePath(grid, actor.gridKey, target.gridKey, actor.def.attackRange, actor.def.movePoints);
        if (steps.length === 0) {
            return false;
        }
        for (const to of steps) {
            const from = actor.gridKey;
            if (grid.move(actor.id, to)) {
                actor.gridKey = to;
                emit({ type: "move", sourceId: actor.id, fromGridKey: from, toGridKey: to, round });
            }
        }
        // 移动消耗能量：消耗"近乎一半"的回合恢复量（能量经济规则 2）
        const moveCost = Math.max(1, Math.round(config.energyGainAttacker * config.energyMoveCostRatio));
        actor.energy = Math.max(0, actor.energy - moveCost);
        return true;
    }

    /** 最近存活敌方（按曼哈顿距离）：移动靠近目标，与攻击目标（前排优先）解耦。 */
    function nearestEnemyOf(actor: MutableUnit): MutableUnit | undefined {
        const opposingSide: AutoBattleSide = actor.side === "ally" ? "enemy" : "ally";
        let nearest: MutableUnit | undefined;
        let best = Number.POSITIVE_INFINITY;
        for (const enemy of sideUnits(opposingSide)) {
            if (!isAutoBattleAlive(enemy)) {
                continue;
            }
            const distance = manhattanDistance(actor.gridKey, enemy.gridKey);
            if (distance < best) {
                best = distance;
                nearest = enemy;
            }
        }
        return nearest;
    }

    /**
     * 技能换位：把单位换位到其所在侧布阵区的相对格（`row:col`，row/col 为布阵区
     * 相对行/列，经 formationSlotOf 映射到 formationCells 对应格；中排顶格或越界
     * 的非法相对格换位失败）。目标格被占用或非法则换位失败（位置不变，不广播
     * teleport）。返回是否换位成功。
     */
    function teleportTarget(unit: MutableUnit, relative: string): boolean {
        const match = /^(\d+):(\d+)$/.exec(relative);
        if (match === null) {
            return false;
        }
        const row = Number(match[1]);
        const col = Number(match[2]);
        const slot = formationSlotOf(row, col);
        if (slot === undefined) {
            return false;
        }
        const cells = grid.formationCells(unit.side);
        const targetKey = cells[slot];
        if (targetKey === undefined || !grid.isFree(targetKey)) {
            return false;
        }
        const from = unit.gridKey;
        if (grid.move(unit.id, targetKey)) {
            unit.gridKey = targetKey;
            emit({
                type: "teleport",
                sourceId: unit.id,
                fromGridKey: from,
                toGridKey: targetKey,
                round,
            });
            return true;
        }
        return false;
    }

    /** 普攻：对锁定目标（无锁定时前排优先）造成自身攻击力伤害（含攻击/防御 buff 修正），双方按配置增长能量。 */
    function basicAttack(actor: MutableUnit): void {
        const opposingSide: AutoBattleSide = actor.side === "ally" ? "enemy" : "ally";
        const target = resolveAutoBattleTarget(sideUnits(opposingSide), actor.lockedTargetId) as MutableUnit | undefined;
        // 锁定目标死亡后该行动即重选新目标并锁定（"目标死亡后顺延"在一个行动内完成）
        actor.lockedTargetId = target?.id ?? null;
        if (target === undefined) {
            // 对侧全灭：终局已由前一次行动判定，此处防御性 no-op
            return;
        }

        // 移动 + 普攻两阶段：超射程向最近敌方前移再结算（移动不改变行动次序，
        // 移动目标与攻击目标（前排优先）解耦，见 nearestEnemyOf）
        moveTowardTarget(actor, nearestEnemyOf(actor) ?? target);

        // 攻击 buff 加成施法者攻击、防御 buff 减免受击伤害（下限 0）
        const attack = actor.def.attack + autoBattleBuffAttackBonus(actor.buffs);
        const defense = autoBattleBuffDefenseBonus(target.buffs);
        const damage = Math.max(0, attack - defense);
        const outcome = applyAutoBattleDamage(target.hp, damage);
        target.hp = outcome.hp;
        // 被击打恢复少量能量（非自己回合也能回复，能量经济规则 3）
        if (!outcome.kills) {
            target.energy = growAutoBattleEnergy(target.energy, target.def.energyMax, config.energyGainTarget);
        }

        emit({
            type: "attack",
            sourceId: actor.id,
            targetId: target.id,
            value: outcome.applied,
            round,
        });

        if (outcome.kills) {
            // 击杀获得大量能量（能量经济规则 4）
            actor.energy = growAutoBattleEnergy(actor.energy, actor.def.energyMax, config.energyGainOnKill);
            emit({ type: "unit-dead", sourceId: actor.id, targetId: target.id, round });
            checkGameOver();
        }
    }

    /** 技能目标解析：按技能 target 字段选择目标；缺省按主效果 kind 推导（damage → 敌方前排、heal → 己方最低 HP）。 */
    function resolveSkillTarget(actor: MutableUnit, target: AutoBattleSkillTarget | undefined, kind: "damage" | "heal"): MutableUnit | undefined {
        if (target === "self") {
            return actor;
        }
        if (target === "ally-lowest-hp" || (target === undefined && kind === "heal")) {
            return selectAutoBattleHealTarget(sideUnits(actor.side)) as MutableUnit | undefined;
        }
        // enemy-front（显式或缺省伤害类）：锁定优先的前排目标；与普攻共用锁定语义，
        // 目标死亡后该行动即重选并锁定（"目标死亡后顺延"在一个行动内完成）
        const opposingSide: AutoBattleSide = actor.side === "ally" ? "enemy" : "ally";
        const selected = resolveAutoBattleTarget(sideUnits(opposingSide), actor.lockedTargetId) as MutableUnit | undefined;
        actor.lockedTargetId = selected?.id ?? null;
        return selected;
    }

    /**
     * 满能量释放技能：统一走 resolveAutoBattleSkill 多效果结算，避免规则多实现。
     * 技能可携带 conditionId（条件不满足时退化为普攻）、target（目标选择）、
     * effects（多效果：伤害/治疗/buff 挂载）与 effectId（视图动效引用）。
     */
    function castSkill(actor: MutableUnit): void {
        const skill = actor.def.skill;

        // 条件判定：引用 skillConditions 表，不满足则本行动退化为普攻（不消耗能量）
        if (skill.conditionId !== undefined) {
            const condition = config.skillConditions.find((entry) => entry.id === skill.conditionId);
            if (condition === undefined || !resolveAutoBattleSkillCondition(condition, actor)) {
                basicAttack(actor);
                return;
            }
        }

        const target = resolveSkillTarget(actor, skill.target, skill.kind);
        if (target === undefined) {
            return;
        }
        if (target !== actor) {
            // 技能也受射程约束：超射程先移动再结算（与普攻两阶段一致）；自目标不移动
            moveTowardTarget(actor, target);
        }

        // 多效果结算：逐条结算伤害/治疗/buff，HP 累积到目标
        const buffById = (buffId: string) => config.buffs.find((entry) => entry.id === buffId);
        const effects = resolveAutoBattleSkill(skill, target.hp, target.maxHp, buffById);
        let hp = target.hp;
        let appliedDamage = 0;
        let appliedHeal = 0;
        let kills = false;
        for (const effect of effects) {
            hp = effect.hp;
            if (effect.kind === "damage") {
                appliedDamage += effect.applied;
                kills = kills || effect.kills;
            } else if (effect.kind === "heal") {
                appliedHeal += effect.applied;
            } else {
                // buff 效果：挂载到目标（定义来自 buff 表）
                target.buffs.push(createAutoBattleBuffInstance(effect.buff));
            }
        }
        target.hp = hp;

        // 伤害/治疗事件（主效果聚合），施法者能量清零
        if (appliedDamage > 0) {
            actor.energy = 0;
            emit({
                type: "skill-damage",
                sourceId: actor.id,
                targetId: target.id,
                value: appliedDamage,
                round,
                effectId: skill.effectId,
            });
            if (kills) {
                // 技能击杀同样获得大量能量（能量经济规则 4；技能清空能量后入账）
                actor.energy = growAutoBattleEnergy(actor.energy, actor.def.energyMax, config.energyGainOnKill);
                emit({ type: "unit-dead", sourceId: actor.id, targetId: target.id, round });
                checkGameOver();
            }
        }
        if (appliedHeal > 0) {
            actor.energy = 0;
            emit({
                type: "skill-heal",
                sourceId: actor.id,
                targetId: target.id,
                value: appliedHeal,
                round,
                effectId: skill.effectId,
            });
        }
        // 纯 buff 技能（无伤害/治疗数值）也消耗能量并清空
        if (appliedDamage === 0 && appliedHeal === 0) {
            actor.energy = 0;
        }

        // 技能可选换位：把目标换位到其侧布阵区相对格（占用则失败不执行）
        if (skill.teleportTo !== undefined && target !== actor) {
            teleportTarget(target, skill.teleportTo);
        }
    }

    function act(actor: MutableUnit): void {
        // 武将自身回合开始时恢复固定能量（能量经济规则 1）
        actor.energy = growAutoBattleEnergy(actor.energy, actor.def.energyMax, config.energyGainAttacker);
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
export function createAutoBattleBattleModule(battle: AutoBattleBattleHandle): IModule {
    return {
        id: "auto_battle.battle",
        dependencies: [],
        start: () => {
            // 控制器在组合根构造时即就绪；start 只是让模块进入装配清单
            void battle.state.round;
        },
    };
}
