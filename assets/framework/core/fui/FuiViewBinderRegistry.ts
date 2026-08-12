/**
 * FuiView 运行时 binder 注册表（实例级、事务式）：Feature assembly 用
 * defineFuiViewBinding 声明「URL → 视图 ctor → 装配函数」并以 register 登记；
 * FuiViewHost 经内部 resolver 在创建 required 组件时解析并执行 binder。
 * 绑定随实例（Feature 装配范围）存续，非 globalThis、不进入 ApplicationContext。
 *
 * 回滚所有权归调用方（Host）：binder 中途抛错时已登记句柄保留在调用方提供的
 * scope 中，本模块不执行任何回滚（见 fui-view-binding spec）。
 */

import type { FuiComponentUrl } from "./FuiComponentRegistry";
import { FuiBindingError, FuiViewBindingRegistrationError } from "./FuiErrors";

/** 事务式绑定作用域：binder 每获得一个句柄立即 own 登记；仅登记句柄，不负责回滚。 */
export interface FuiViewBindingScope {
    own(handle: { dispose(): void }): void;
}

/** 运行时绑定描述：URL → 视图构造器 → 装配函数（定义后冻结，禁止运行时篡改）。 */
export interface FuiViewBinding<V extends object> {
    readonly url: FuiComponentUrl;
    readonly ctor: new () => V;
    readonly bind: (view: V, scope: FuiViewBindingScope) => void;
}

/** 注册接口：Feature assembly 在组合期注册绑定，返回退订句柄（幂等移除）。 */
export interface FuiViewBindingRegistrar {
    register<V extends object>(binding: FuiViewBinding<V>): { dispose(): void };
}

/** 内部解析接口：Host 在创建路径按 URL 解析并执行 binder（不进根公共导出）。 */
export interface FuiViewBindingResolver {
    bindRequired<V extends object>(
        url: FuiComponentUrl,
        view: V,
        scope: FuiViewBindingScope,
    ): void;
}

/** 创建绑定描述：返回冻结对象，防止组合期后误改 url/ctor/bind。 */
export function defineFuiViewBinding<V extends object>(
    url: FuiComponentUrl,
    ctor: new () => V,
    bind: (view: V, scope: FuiViewBindingScope) => void,
): FuiViewBinding<V> {
    return Object.freeze({ url, ctor, bind });
}

/**
 * 创建作用域：own 为纯句柄登记（binder 获得句柄即登记，失败不在此回滚）。
 * disposeAll 仅供 Host（唯一回滚所有者）逆序释放并清空，重复调用为 no-op。
 */
export function createFuiViewBindingScope(): FuiViewBindingScope & {
    disposeAll(): void;
} {
    const handles: Array<{ dispose(): void }> = [];
    return {
        own(handle) {
            handles.push(handle);
        },
        disposeAll() {
            for (let i = handles.length - 1; i >= 0; i--) {
                handles[i]!.dispose();
            }
            handles.length = 0;
        },
    };
}

/**
 * 实例级注册表工厂：返回 registrar + resolver 一体对象。
 * 不进根公共导出，由 boot 组合根内部深层导入后分发。
 */
export function createFuiViewBinderRegistry(): FuiViewBindingRegistrar &
    FuiViewBindingResolver {
    // 存储统一按 <object> 擦除视图类型；bind 参数逆变导致泛型收窄无法直接赋值，
    // 仅在登记边界做一次受控转换，解析端以调用方视图类型经 instanceof 校验后调用。
    const bindings = new Map<FuiComponentUrl, FuiViewBinding<object>>();

    const registrar: FuiViewBindingRegistrar = {
        register<V extends object>(binding: FuiViewBinding<V>) {
            if (bindings.has(binding.url)) {
                throw new FuiViewBindingRegistrationError(binding.url);
            }
            bindings.set(
                binding.url,
                binding as unknown as FuiViewBinding<object>,
            );
            let disposed = false;
            return {
                dispose() {
                    // 幂等：重复 dispose 为 no-op；重复注册已被拒绝，按 url 直删即正确
                    if (disposed) {
                        return;
                    }
                    disposed = true;
                    bindings.delete(binding.url);
                },
            };
        },
    };

    const resolver: FuiViewBindingResolver = {
        bindRequired<V extends object>(
            url: FuiComponentUrl,
            view: V,
            scope: FuiViewBindingScope,
        ) {
            const binding = bindings.get(url) as FuiViewBinding<V> | undefined;
            if (binding === undefined) {
                throw new FuiViewBindingRegistrationError(url);
            }
            if (!(view instanceof binding.ctor)) {
                throw new FuiBindingError(url, binding.ctor.name, "runtime");
            }
            // binder 抛错原样传播：不包装、不吞错、不回滚 scope（Host 负责回滚）
            binding.bind(view, scope);
        },
    };

    return { ...registrar, ...resolver };
}
