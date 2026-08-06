/** 配置键：配置表中条目的标识。 */
export type ConfigKey = string;

/**
 * 类型化读取声明（typed read declaration）：调用方在读取时声明期望的类型与形状。
 * parse 负责把原始值解析/校验为声明类型；形状不符抛 ConfigTypeMismatchError，
 * 内容无法按期望解析抛 ConfigParseError。不依赖 cc/fgui，不触达存档后端。
 */
export interface ConfigReadType<T> {
  /** 声明类型名，用于诊断信息。 */
  readonly name: string;
  /** 解析/校验原始值为声明类型；失败抛类型化错误。 */
  readonly parse: (key: ConfigKey, raw: unknown) => T;
}

/** 只读配置快照：配置装载后暴露给读取方的不可变结构（深度冻结）。 */
export type ReadonlyConfigSnapshot = Readonly<Record<ConfigKey, unknown>>;

/**
 * 引擎无关的类型化配置服务：不可变配置表 + 类型化读取 + 默认值回退 + 只读快照。
 * 抛错均为类型化错误：ConfigMissingError / ConfigTypeMismatchError /
 * ConfigParseError / ConfigLoadError，定义于 contracts/config/ConfigErrors。
 */
export interface ConfigTable {
  /** 按声明类型读取配置值；键缺失抛 ConfigMissingError。 */
  read<T>(key: ConfigKey, type: ConfigReadType<T>): T;
  /** 带默认值读取：键缺失时回退默认值，键存在时返回实际值（解析失败仍报错）。 */
  read<T>(key: ConfigKey, type: ConfigReadType<T>, defaultValue: T): T;
  /** 只读快照：深度冻结结构，运行时不可修改。 */
  snapshot(): ReadonlyConfigSnapshot;
}
