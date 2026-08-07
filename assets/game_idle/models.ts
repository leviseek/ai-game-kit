/**
 * 放置挂机品类业务模型：离线收益与成长公式仅存在于游戏层，
 * 框架层不出现对应类型（负向边界断言由 4.1 测试锁定）。
 */

/** 成长进度状态：等级与金币；离线收益结算后经版本化存档持久化。 */
export interface IdleProgressState {
  readonly level: number;
  readonly gold: number;
  /** 上次在线/离线结算的墙钟时间戳（毫秒）。 */
  readonly lastSettledAtMs: number;
}

/** 离线收益结算结果：离线时长与结算所得金币。 */
export interface IdleOfflineSettlement {
  readonly elapsedMs: number;
  readonly goldEarned: number;
}

/** 存档记录：离线收益结算后写入的金币与等级。 */
export interface IdleSaveRecord {
  readonly level: number;
  readonly gold: number;
}
