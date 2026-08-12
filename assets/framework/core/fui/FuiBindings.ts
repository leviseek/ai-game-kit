/**
 * FuiView 声明式绑定装饰器（legacy 语义，experimentalDecorators 已开）。
 * 装饰器只在类定义期收集元数据（登记组件 / 收集点击），不做实际绑定；
 * 实际字段注入与点击注册由 FuiView.__attach 在组件创建后统一执行
 * （见 contracts/ui/FuiView.ts 与 adapters/cocos/ui/FuiViewHost.ts）。
 */

import type { FuiClickMeta, FuiView } from "../../contracts/ui/FuiView";
import { getFuiComponentRegistry } from "./FuiComponentRegistry";

/** @FClick 元数据原型挂载键：同一组件原型链上收集的点击声明。 */
const FUI_CLICK_META_KEY = "__fuiClickMeta__";

/** 读取原型上的 @FClick 元数据（含基类继承链，最内层优先）。 */
export function collectClickMeta(ctor: new () => unknown): readonly FuiClickMeta[] {
    const out: FuiClickMeta[] = [];
    let proto: unknown = ctor.prototype;
    while (proto !== null) {
        const meta = (proto as Record<string, unknown>)[FUI_CLICK_META_KEY];
        if (Array.isArray(meta)) {
            out.unshift(...(meta as FuiClickMeta[]));
        }
        proto = Object.getPrototypeOf(proto);
    }
    return out;
}

/**
 * 组件绑定装饰器：登记 `ui://<包>/<组件>` 复合键 → 组件类与字段描述。
 * 重复登记同一复合键抛错。参数 nodeNames 为 gen-types 生成的节点名联合，
 * 用于类型约束与运行时字段注入来源。
 */
export function FUIBind<N extends string>(
    packageName: string,
    componentName: string,
    fields: Readonly<Record<string, N>>,
): (ctor: new () => unknown) => void {
    const url = `ui://${packageName}/${componentName}`;
    return (ctor: new () => unknown): void => {
        const registry = getFuiComponentRegistry();
        registry.register(url, {
            ctor: ctor as new () => FuiView<unknown, unknown>,
            fields: fields as Readonly<Record<string, string>>,
            clicks: collectClickMeta(ctor),
        });
    };
}

/**
 * 点击绑定装饰器：收集「节点名 → 原型方法引用」元数据。
 * 用 descriptor.value 引用而非方法名字符串，方法改名不破坏绑定。
 * 节点名受生成节点名联合类型约束（编译期拼错拦截）。
 */
export function FClick<N extends string>(nodeName: N): MethodDecorator {
    return ((target: object, _propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<unknown>): TypedPropertyDescriptor<unknown> | void => {
        const methodRef = descriptor.value as FuiClickMeta["methodRef"];
        const proto = target as Record<string, unknown>;
        const existing = proto[FUI_CLICK_META_KEY];
        const meta: FuiClickMeta[] = Array.isArray(existing) ? existing : [];
        meta.push({ nodeName, methodRef });
        proto[FUI_CLICK_META_KEY] = meta;
    }) as MethodDecorator;
}
