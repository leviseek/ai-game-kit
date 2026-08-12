/**
 * FuiView 组件注册表：@FUIBind 在类定义时（模块加载期）登记组件类与字段描述，
 * FuiViewHost 在创建路径按「包+组件名」复合键查询。注册发生在装饰器求值期，
 * 早于组合根 DI 注入，故采用 globalThis 私有符号键单例（与 BundleModuleRegistry
 * 的跨 bundle 注册桥同构），业务代码经框架根入口的装饰器间接写入。
 */

import type { FuiClickMeta, FuiView } from "../../contracts/ui/FuiView";

/**
 * 组件 URL 品牌类型：`ui://<包>/<组件>` 模板字面量。绑定链唯一的 URL 契约，
 * 字面量（含生成常量）天然满足，宽化 string 编译期拒绝，杜绝裸字符串与短 id 散落。
 */
export type FuiComponentUrl = `ui://${string}/${string}`;

/** 内部 URL 工厂：从包名/组件名构造 FuiComponentUrl 的唯一构造点（不进根公共导出）。 */
export function createFuiComponentUrl(packageName: string, componentName: string): FuiComponentUrl {
    return `ui://${packageName}/${componentName}`;
}

export interface FuiComponentEntry {
    /** 组件类构造器（new 即创建 FuiView 实例）。 */
    readonly ctor: new () => FuiView<unknown, unknown>;
    /** 生成字段描述：元件名 → 能力 kind（来自 gen-types 产物）。 */
    readonly fields: Readonly<Record<string, string>>;
    /** @FClick 收集的点击元数据（原型方法引用，实例化时 bind）。 */
    readonly clicks: readonly FuiClickMeta[];
    /** 运行时绑定策略：required 组件缺少对应 binder 时创建失败（见 fui-view-binding spec）。 */
    readonly runtimeBinding: "required" | "none";
}

export interface FuiComponentRegistry {
    /** 登记组件；同一复合键重复登记抛错（fail-fast）。 */
    register(url: FuiComponentUrl, entry: FuiComponentEntry): void;
    /** 按复合键查询；未登记返回 undefined。 */
    lookup(url: FuiComponentUrl): FuiComponentEntry | undefined;
}

const GLOBAL_KEY = "__ai_game_kit_fui_components__";

/** 组件注册失败：复合键重复登记。 */
export class FuiComponentRegistrationError extends Error {
    constructor(url: FuiComponentUrl) {
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
    const entries = new Map<FuiComponentUrl, FuiComponentEntry>();
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
