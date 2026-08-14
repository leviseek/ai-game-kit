import type { IConfigKey } from "./IConfigKey";
import type { IConfigReadType } from "./IConfigReadType";
import type { IReadonlyConfigSnapshot } from "./IReadonlyConfigSnapshot";

/**
 * 引擎无关的类型化配置服务：不可变配置表 + 类型化读取 + 默认值回退 + 只读快照。
 * 抛错均为类型化错误：ConfigMissingError / ConfigTypeMismatchError /
 * ConfigParseError / ConfigLoadError，定义于 core/config/ConfigErrors
 * （对齐 ADR-013：错误类留在 core 实现层，contracts 层只放纯类型契约）。
 */
export interface IConfigTable {
    /** 按声明类型读取配置值；键缺失抛 ConfigMissingError。 */
    read<T>(key: IConfigKey, type: IConfigReadType<T>): T;
    /** 带默认值读取：键缺失时回退默认值，键存在时返回实际值（解析失败仍报错）。 */
    read<T>(key: IConfigKey, type: IConfigReadType<T>, defaultValue: T): T;
    /** 只读快照：深度冻结结构，运行时不可修改。 */
    snapshot(): IReadonlyConfigSnapshot;
}
