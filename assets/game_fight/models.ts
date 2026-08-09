/**
 * 横板格斗品类业务模型：判定盒、连招与帧数据仅存在于游戏层，
 * 框架层不出现对应类型（负向边界断言由 6.1 测试锁定）。
 */

/** 类型化 action：格斗战斗的输入动作，由输入上下文路由产生采样。 */
export type FightAction = "punch" | "kick" | "block";

/** 判定盒：招式生效的命中区域。 */
export interface FightHitbox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 帧数据：招式各阶段帧数与伤害，由命中帧推导结算。 */
export interface FightFrameData {
  readonly id: string;
  readonly name: string;
  readonly startupFrames: number;
  readonly activeFrames: number;
  readonly recoveryFrames: number;
  readonly damage: number;
  readonly hitbox: FightHitbox;
}

/** 战斗状态：帧号、双方血量、连招计数与当前活动招式。 */
export interface FightBattleState {
  readonly frame: number;
  readonly playerHp: number;
  readonly enemyHp: number;
  readonly combo: number;
  readonly activeMoveId: string | null;
}
