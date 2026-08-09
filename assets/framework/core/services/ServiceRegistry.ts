import { FrameworkError } from "../errors/FrameworkError";

// 服务注册表：组合根以类型化 token 注册/解析服务的最小实现。
// 支持实例注册与工厂注册；工厂经注入 resolve 解析依赖，解析期以进行中
// 集合检测依赖循环。注册表不缓存工厂解析结果，不管理服务生命周期。
declare const serviceTokenBrand: unique symbol;

export interface ServiceToken<T> {
    readonly description: string;
    // brand 仅参与编译期结构判别，使不同服务类型的 token 不可互换；运行期不携带该键值。
    readonly [serviceTokenBrand]: T;
}

export function createServiceToken<T>(description: string): ServiceToken<T> {
    // 运行期 token 只需 description；brand 键由编译期类型系统保证唯一性。
    return { description } as unknown as ServiceToken<T>;
}

/** 同一 token 重复注册时的类型化错误，携带 token 描述用于诊断。 */
export class ServiceRegistrationError extends FrameworkError {
    readonly description: string;

    constructor(description: string) {
        super(`Service already registered: ${description}`, {
            component: "service-registry",
        });

        this.name = "ServiceRegistrationError";
        this.description = description;
    }
}

/** 解析缺失/循环依赖 token 时的类型化错误，携带 token 描述用于诊断。 */
export class ServiceResolutionError extends FrameworkError {
    readonly description: string;

    constructor(description: string) {
        super(`Service not resolvable: ${description}`, {
            component: "service-registry",
        });

        this.name = "ServiceResolutionError";
        this.description = description;
    }
}

export interface ServiceRegistry {
    register<T>(token: ServiceToken<T>, instance: T): void;
    registerFactory<T>(
        token: ServiceToken<T>,
        factory: (resolve: <U>(token: ServiceToken<U>) => U) => T,
    ): void;
    resolve<T>(token: ServiceToken<T>): T;
    isRegistered<T>(token: ServiceToken<T>): boolean;
}

// 已注册条目：实例直接持有，工厂持有创建函数。registerFactory 不缓存
// 工厂解析结果，每次 resolve 按工厂当前实现重新求值。
type Registration<T> =
    | { readonly kind: "instance"; readonly value: T }
    | { readonly kind: "factory"; readonly factory: (resolve: <U>(token: ServiceToken<U>) => U) => T };

export function createServiceRegistry(): ServiceRegistry {
    // 以 token 对象身份为键存储注册条目；运行期不依赖 token 结构内容。
    const registrations = new Map<ServiceToken<unknown>, Registration<unknown>>();
    // 解析中的 token 集合：工厂依赖解析时用于检测依赖循环。
    const resolving = new Set<ServiceToken<unknown>>();

    function findToken<T>(token: ServiceToken<T>): ServiceToken<unknown> {
        return token as ServiceToken<unknown>;
    }

    function resolveInternal<T>(token: ServiceToken<T>): T {
        const key = findToken(token);
        const registration = registrations.get(key);

        if (registration === undefined) {
            throw new ServiceResolutionError(token.description);
        }

        if (registration.kind === "instance") {
            return registration.value as T;
        }

        if (resolving.has(key)) {
            // 工厂依赖形成环：再次进入进行中集合说明解析链循环。
            throw new ServiceResolutionError(token.description);
        }

        resolving.add(key);
        try {
            return registration.factory(resolveInternal) as T;
        } finally {
            resolving.delete(key);
        }
    }

    return {
        register<T>(token: ServiceToken<T>, instance: T): void {
            const key = findToken(token);

            if (registrations.has(key)) {
                throw new ServiceRegistrationError(token.description);
            }

            registrations.set(key, { kind: "instance", value: instance });
        },

        registerFactory<T>(
            token: ServiceToken<T>,
            factory: (resolve: <U>(token: ServiceToken<U>) => U) => T,
        ): void {
            const key = findToken(token);

            if (registrations.has(key)) {
                throw new ServiceRegistrationError(token.description);
            }

            registrations.set(key, { kind: "factory", factory });
        },

        resolve<T>(token: ServiceToken<T>): T {
            return resolveInternal(token);
        },

        isRegistered<T>(token: ServiceToken<T>): boolean {
            return registrations.has(findToken(token));
        },
    };
}
