/**
 * 全局 Bundle 模块注册桥：存于 globalThis 私有符号键，供跨 Asset Bundle 脚本
 * 共享模块描述符（对齐 Cocos 官方"跨 bundle 共享暴露到全局命名空间"建议）。
 * registerBundle 幂等（bundle 重载时重新登记，避免残留旧描述符）；
 * lookupBundle 只在对应 bundle 加载后调用，避免隐式时序耦合。
 */
export interface BundleModuleRegistry {
    registerBundle(name: string, exports: Readonly<Record<string, unknown>>): void;
    lookupBundle(name: string): Readonly<Record<string, unknown>> | undefined;
}

const GLOBAL_KEY = "__ai_game_kit_bundle_modules__";

export function getBundleModuleRegistry(): BundleModuleRegistry {
    const globalObject = globalThis as Record<string, unknown>;
    const existing = globalObject[GLOBAL_KEY] as BundleModuleRegistry | undefined;
    if (existing !== undefined) {
        return existing;
    }
    const modules = new Map<string, Readonly<Record<string, unknown>>>();
    const registry: BundleModuleRegistry = {
        registerBundle(name, exports) {
            modules.set(name, exports);
        },
        lookupBundle(name) {
            return modules.get(name);
        },
    };
    globalObject[GLOBAL_KEY] = registry;
    return registry;
}

export function registerBundle(
    name: string,
    exports: Readonly<Record<string, unknown>>,
): void {
    getBundleModuleRegistry().registerBundle(name, exports);
}

export function lookupBundle(
    name: string,
): Readonly<Record<string, unknown>> | undefined {
    return getBundleModuleRegistry().lookupBundle(name);
}
