/**
 * 自动战斗卡牌 RPG 品类业务模型：单位/技能/站位/战斗状态/事件等业务规则
 * 仅存在于游戏层，框架层不出现对应类型（负向边界断言由测试锁定）。
 */

/** 阵营：己方与敌方。 */
export type AutoBattleSide = "ally" | "enemy";

/** 站位：前排 > 中排 > 后排，决定目标选择优先级。 */
export type AutoBattlePosition = "front" | "mid" | "back";

/** 技能类型：伤害技能打击敌方前排目标，治疗技能恢复己方最低血量单位。 */
export type AutoBattleSkillKind = "damage" | "heal";

/** 战斗阶段：进行中与终局；终局后 tick 不再推进。 */
export type AutoBattlePhase = "fighting" | "over";

/** 技能配置：由配置表驱动，energyCost 是满能量释放阈值。 */
export interface AutoBattleSkill {
    readonly id: string;
    readonly name: string;
    readonly kind: AutoBattleSkillKind;
    /** 伤害或治疗量。 */
    readonly value: number;
    readonly energyCost: number;
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
    readonly energyMax: number;
    readonly skill: AutoBattleSkill;
}

/** 英雄静态配置：英雄池条目（编队引用对象），形状为 AutoBattleUnit 去掉 side/index（开战实例化时推导）。 */
export interface AutoBattleHero {
    readonly id: string;
    readonly name: string;
    readonly position: AutoBattlePosition;
    readonly maxHp: number;
    readonly attack: number;
    readonly speed: number;
    readonly energyMax: number;
    readonly skill: AutoBattleSkill;
}

/** 玩家编队：定长槽位序列（slot 0..MAX_TEAM_SIZE-1 → 英雄 id），空槽为 null；可变、可持久化。 */
export interface AutoBattleLineup {
    readonly slots: readonly (string | null)[];
}

/** 战斗中单位运行时快照：静态属性 + 当前 HP/能量。 */
export interface AutoBattleUnitState extends AutoBattleUnit {
    readonly hp: number;
    readonly energy: number;
}

/** 战斗事件类型：日志回放与冒烟断言依赖的判别维度。 */
export type AutoBattleEventType =
    | "round-start"
    | "attack"
    | "skill-damage"
    | "skill-heal"
    | "unit-dead"
    | "battle-over"
    | "restart";

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

/** 代表性 FairyGUI route：路由标识由游戏层定义，呈现由适配层完成。 */
export const AUTO_BATTLE_ROUTE = "auto_battle/battle";
