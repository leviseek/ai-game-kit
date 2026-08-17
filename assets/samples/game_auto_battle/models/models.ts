/**
 * 自动战斗卡牌 RPG 品类业务模型：单位/技能/站位/战斗状态/事件等业务规则
 * 仅存在于游戏层，框架层不出现对应类型（负向边界断言由测试锁定）。
 */

/** 阵营：己方与敌方。 */
export type AutoBattleSide = "ally" | "enemy";

/** 站位：前排 > 中排 > 后排，决定目标选择优先级。 */
export type AutoBattlePosition = "front" | "mid" | "back";

/** 技能类型：兼容旧格式单效果技能的主类型（新格式技能以 effects 多效果为准）。 */
export type AutoBattleSkillKind = "damage" | "heal";

/** 技能目标选择：敌方前排 / 己方最低 HP 比例 / 自身。 */
export type AutoBattleSkillTarget = "enemy-front" | "ally-lowest-hp" | "self";

/** 技能效果类型：伤害 / 治疗 / 挂载 buff。 */
export type AutoBattleSkillEffectKind = "damage" | "heal" | "buff";

/** 战斗阶段：进行中与终局；终局后 tick 不再推进。 */
export type AutoBattlePhase = "fighting" | "over";

/** 技能单条效果：kind 决定结算语义，buffId 在 kind=buff 时引用 buff 表。 */
export interface AutoBattleSkillEffect {
    readonly kind: AutoBattleSkillEffectKind;
    readonly value: number;
    /** buff 效果引用的 buff 表 id（kind=buff 时必填）。 */
    readonly buffId?: string;
}

/** 技能配置：由配置表驱动，energyCost 是满能量释放阈值。 */
export interface AutoBattleSkill {
    readonly id: string;
    readonly name: string;
    /** 主效果类型：单效果快捷（effects 缺省时等价于 [{kind, value}]）。 */
    readonly kind: AutoBattleSkillKind;
    /** 伤害或治疗量（单效果快捷值）。 */
    readonly value: number;
    readonly energyCost: number;
    /**
     * 多效果列表：缺省为单效果 [{kind, value}]；提供时逐条结算（含 buff 挂载），
     * 主效果字段仅作向后兼容的快捷形态。
     */
    readonly effects?: readonly AutoBattleSkillEffect[];
    /** 目标选择：缺省按 kind 推导（damage→enemy-front，heal→ally-lowest-hp）。 */
    readonly target?: AutoBattleSkillTarget;
    /** 技能条件表 id：释放前判定，不满足则本轮退化为普攻。 */
    readonly conditionId?: string;
    /** 技能动效表 id：视图层投影专属动效（如爆炸）。 */
    readonly effectId?: string;
    /**
     * 可选换位目标格（伤害技能）：结算后把目标换位到其所在侧布阵区的相对格
     * （`row:col`，行列 0..布阵区-1）；目标格被占用则换位失败不执行。
     */
    readonly teleportTo?: string;
}

/** 基础属性表条目：数值中心，单位按 id 引用（maxHp/attack/speed/attackRange/movePoints）。 */
export interface AutoBattleBaseAttributes {
    readonly id: string;
    readonly maxHp: number;
    readonly attack: number;
    readonly speed: number;
    /** 攻击射程：缺省 1（配置表可调）。 */
    readonly attackRange: number;
    /** 每次行动可移动格数：超射程向前移动时最多走的格数（配置表可调，缺省 1）。 */
    readonly movePoints: number;
}

/** 单位动画名集合：保留 gesture 兼容旧资源，并扩展完整战斗动作。 */
export const AUTO_BATTLE_ANIM_NAMES = ["idle", "gesture", "walk", "run", "attack", "slash", "hit", "weak", "stun", "death", "skillRaise"] as const;
export type AutoBattleAnimName = (typeof AUTO_BATTLE_ANIM_NAMES)[number];

/** 单位动画表条目：帧 URL、独立帧数和帧时长。 */
export interface AutoBattleUnitAnimation {
    readonly id: string;
    /** 动画专属 bundle 名。 */
    readonly bundle: string;
    /** bundle 内目录前缀。 */
    readonly dir: string;
    /** 旧资源的缺省帧数；动作未声明独立帧数时回退该值。 */
    readonly frameCount: number;
    /** 动画名 → 独立帧数。 */
    readonly frameCountByAnim: Readonly<Record<AutoBattleAnimName, number>>;
    /** 动画名 → 单帧展示时长（ms）。 */
    readonly frameMsByAnim: Readonly<Record<AutoBattleAnimName, number>>;
    /** 动画名 → 帧名前缀（如 warrior_f_idle）。 */
    readonly prefixByAnim: Readonly<Record<AutoBattleAnimName, string>>;
}

/** buff 类型：攻击加成 / 防御加成 / 持续伤害 / 持续治疗。 */
export type AutoBattleBuffKind = "attack-up" | "defense-up" | "damage-over-time" | "heal";

/** buff 表条目：数值与持续回合数（回合结束时递减，归零移除）。 */
export interface AutoBattleBuff {
    readonly id: string;
    readonly name: string;
    readonly kind: AutoBattleBuffKind;
    readonly value: number;
    readonly duration: number;
}

/** 战斗内挂载的 buff 实例：定义 + 剩余回合数。 */
export interface AutoBattleBuffInstance {
    readonly def: AutoBattleBuff;
    readonly remaining: number;
}

/** 技能动效表条目：对接视图层 HitFeedbackEffect 的视觉意图类型。 */
export interface AutoBattleSkillEffectDef {
    readonly id: string;
    /** 视觉意图类型：兼容旧反馈，并支持物理命中、火球飞行和治疗光环。 */
    readonly kind: "explosion" | "flash" | "float" | "physical-impact" | "fireball" | "heal-aura";
}

/** 技能条件表条目：释放/目标选择判定规则。 */
export interface AutoBattleSkillCondition {
    readonly id: string;
    /**
     * 条件类型：
     * - self-hp-ratio：施法者 HP 比例低于阈值 value（0..1）时满足
     * - target-position：目标位于指定站位 position 时满足（value 为站位名）
     * - always：恒满足（无条件技能的显式形态）
     */
    readonly kind: "self-hp-ratio" | "target-position" | "always";
    readonly value?: number | string;
}

/** 单位静态配置：属性与技能来自配置表，side/index 由配置读取器推导。 */
export interface AutoBattleUnit {
    readonly id: string;
    readonly name: string;
    readonly side: AutoBattleSide;
    /** 队内逻辑槽位序号 0..N-1（实例化顺序与同排稳定次序身份），与 position（目标选择语义）分工。 */
    readonly index: number;
    readonly position: AutoBattlePosition;
    readonly maxHp: number;
    readonly attack: number;
    readonly speed: number;
    /** 攻击射程：普攻/伤害技能与目标曼哈顿距离超过该值前移后攻击（默认 1）。 */
    readonly attackRange: number;
    /** 每次行动可移动格数：超射程向前移动时最多走的格数（默认 1，配置表可调）。 */
    readonly movePoints: number;
    readonly energyMax: number;
    readonly skill: AutoBattleSkill;
    /** 单位动画表 id：视图层按此查 unitAnimations 表生成帧 URL（缺省走变体回退）。 */
    readonly animationId?: string;
}

/** 英雄静态配置：英雄池条目（编队引用对象），形状为 AutoBattleUnit 去掉 side/index（开战实例化时推导）。 */
export interface AutoBattleHero {
    readonly id: string;
    readonly name: string;
    readonly position: AutoBattlePosition;
    readonly maxHp: number;
    readonly attack: number;
    readonly speed: number;
    /** 攻击射程：缺省 1（配置表可调）。 */
    readonly attackRange: number;
    /** 每次行动可移动格数：超射程向前移动时最多走的格数（默认 1，配置表可调）。 */
    readonly movePoints: number;
    readonly energyMax: number;
    readonly skill: AutoBattleSkill;
    /** 单位动画表 id：视图层按此查 unitAnimations 表生成帧 URL（缺省走变体回退）。 */
    readonly animationId?: string;
}

/** 玩家编队：定长布阵区容量槽位序列（slot 0..FORMATION_GRID_SIZE-1 → 英雄 id），非空数受上阵上限 MAX_TEAM_SIZE 约束；空槽为 null；可变、可持久化。 */
export interface AutoBattleLineup {
    readonly slots: readonly (string | null)[];
}

/** 战斗中单位运行时快照：静态属性 + 当前 HP/能量 + 当前所在网格格。 */
export interface AutoBattleUnitState extends AutoBattleUnit {
    readonly hp: number;
    readonly energy: number;
    /** 当前所在网格格（change 05 阶段 = 布阵出发点，固定不变；距离移动留 change 08）。 */
    readonly gridKey: string;
    /** 当前锁定攻击目标，null 表示未锁定；目标死亡后由下一行动重选。 */
    readonly lockedTargetId: string | null;
    /** 当前挂载的 buff 列表（含剩余回合），供测试与表现层断言/消费。 */
    readonly buffs: readonly AutoBattleBuffInstance[];
}

/** 战斗事件类型：日志回放与冒烟断言依赖的判别维度。 */
export type AutoBattleEventType = "round-start" | "attack" | "skill-damage" | "skill-heal" | "unit-dead" | "battle-over" | "restart" | "move" | "teleport";

/** 战斗事件：seq 保序，time 为事件发生时模拟时钟读数。 */
export interface AutoBattleEvent {
    readonly seq: number;
    readonly type: AutoBattleEventType;
    readonly time: number;
    readonly sourceId: string;
    readonly targetId?: string;
    readonly value?: number;
    readonly round?: number;
    readonly result?: "win" | "lose";
    /** move/teleport 事件：起始与目标网格格。 */
    readonly fromGridKey?: string;
    readonly toGridKey?: string;
    /** round-start 事件：当前存活单位 id 列表（入场动画消费）。 */
    readonly unitIds?: readonly string[];
    /** skill-damage/skill-heal 事件：技能动效表 id（视图层按此投影专属动效）。 */
    readonly effectId?: string;
}

/** 战斗状态：轮次/行动序列快照/胜负，供渲染与断言消费。 */
export interface AutoBattleState {
    readonly round: number;
    readonly phase: AutoBattlePhase;
    /** 当前行动序列（单位 id，每轮开始按存活单位速度降序快照）。 */
    readonly order: readonly string[];
    readonly actionIndex: number;
    readonly result: "win" | "lose" | undefined;
    readonly units: readonly AutoBattleUnitState[];
}

/** 挂机收益状态：离线收益结算/入账后的持久化快照。 */
export interface IdleRewardState {
    /** 上次结算/入账的墙钟时间戳（毫秒）；离线收益按它与当前墙钟的差值计算。 */
    readonly lastSeenAtMs: number;
    /** 累计收益：每次离线结算入账后累加。 */
    readonly totalRewards: number;
    /** 最近一次入账的墙钟时间戳（毫秒）。 */
    readonly earnedAtMs: number;
}

/** 离线收益结算结果：离线分钟数与本次应得收益。 */
export interface IdleOfflineSettlement {
    readonly minutes: number;
    readonly earned: number;
}

/** 代表性 FairyGUI route：路由标识由游戏层定义，呈现由适配层完成。 */
export const AUTO_BATTLE_ROUTE = "auto_battle/battle";
