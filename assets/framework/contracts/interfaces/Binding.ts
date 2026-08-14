import type { ITextBinding } from "./ITextBinding";
import type { IProgressBinding } from "./IProgressBinding";
import type { IVisibleBinding } from "./IVisibleBinding";
import type { IPositionBinding } from "./IPositionBinding";
import type { ICommandBinding } from "./ICommandBinding";

/**
 * 绑定声明判别联合：描述 VM 字段到视图节点的映射关系，纯数据。
 * 例外说明：判别联合无法用 interface 表达（interface 不能 extends 联合类型），
 * 故本 type 别名是 contracts 层唯一保留的 type 形态（其余均已 interface 化），
 * 供渲染器按 kind 判别分发；成员接口 ITextBinding 等可独立引用。
 */
export type Binding<VM> = ITextBinding<VM> | IProgressBinding<VM> | IVisibleBinding<VM> | IPositionBinding<VM> | ICommandBinding<VM>;
