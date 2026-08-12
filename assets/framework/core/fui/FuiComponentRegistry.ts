/**
 * FuiView 组件注册表：@FUIBind 在类定义时（模块加载期）登记组件类与字段描述，
 * FuiViewHost 在创建路径按「包+组件名」复合键查询。注册发生在装饰器求值期，
 * 早于组合根 DI 注入，故采用 globalThis 私有符号键单例（与 BundleModuleRegistry
 * 的跨 bundle 注册桥同构），业务代码经框架根入口的装饰器间接写入。
 */

import type { FuiClickMeta, FuiView } from "../../contracts/ui/FuiView";

export interface FuiComponentEntry {
    /** 组件类构造器（new 即创建 FuiView 实例）。 */
    readonly ctor: new () => FuiView<unknown, unknown>;
    /** 生成字段描述：元件名 → 能力 kind（来自 gen-types 产物）。 */
    readonly fields: Readonly<Record<string, string>>;
    /** @FClick 收集的点击元数据（原型方法引用，实例化时 bind）。 */
    readonly clicks: readonly FuiClickMeta[];
}

export interface FuiComponentRegistry {
    /** 登记组件；同一复合键重复登记抛错（fail-fast）。 */
    register(url: string, entry: FuiComponentEntry): void;
    /** 按复合键查询；未登记返回 undefined。 */
    lookup(url: string): FuiComponentEntry | undefined;
}

const GLOBAL_KEY = "__ai_game_kit_fui_components__";

/** 组件注册失败：复合键重复登记。 */
export class FuiComponentRegistrationError extends Error {
    constructor(url: string) {
        super(`Fui component already registered: ${url}`);
        this.name = "FuiComponentRegistrationError";
    }
}

export function getFuiComponentRegistry(): FuiComponentRegistry {
    const globalObject = globalThis as Record<string, unknown>;
    const existing = globalObject[GLOBAL_KEY] as FuiComponentRegistry | undefined;
    if (existing !== undefined) {
        return existing;
    }
    const entries = new Map<string, FuiComponentEntry>();
    const registry: FuiComponentRegistry = {
        register(url, entry) {
            if (entries.has(url)) {
                throw new FuiComponentRegistrationError(url);
            }
            entries.set(url, entry);
        },
        lookup(url) {
            return entries.get(url);
        },
    };
    globalObject[GLOBAL_KEY] = registry;
    return registry;
}
