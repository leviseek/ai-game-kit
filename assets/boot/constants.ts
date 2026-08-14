/**
 * boot 组合根外部契约字符串归口（AGENTS「字符串归口」三问命中项）：
 * bundle 名、FGUI package path、哨兵资源与冒烟动态映射键。这些字符串
 * 耦合外部契约（bundle 配置 / ui/assets 包目录 / samples 注册桥），
 * 拼错会静默断裂（加载失败/映射读空），必须进常量表而非消费点裸写。
 */

/** bundle 名（与 assets/bundle 配置对齐）。 */
export const BUNDLES = {
    /** UI bundle：FGUI package 产物（assets/ui 目录）。 */
    ui: "ui",
    /** game bundle：入口场景与列表页组装。 */
    game: "game",
    /** samples bundle：品类夹具/呈现器/冒烟/动态映射注册桥。 */
    samples: "samples",
    /** common bundle：场景流转冒烟用目标（release-loop 验证）。 */
    common: "common",
    /** animations bundle：自动战斗动画帧（爆炸/单位形象序列图，assets/animations）。 */
    animations: "animations",
} as const;
export type BundleName = (typeof BUNDLES)[keyof typeof BUNDLES];

/** FGUI package path（与 ui/assets 包目录对齐，`<包名>/<包名>`）。 */
export const PACKAGE_PATHS = {
    /** 共享 UI 依赖包：品类页跨包引用的通用按钮/进度条组件载体。 */
    common: "Common/Common",
    /** Demo 包：列表页与 UI 冒烟序列目标。 */
    demo: "Demo/Demo",
    /** DevOverlay 包：dev overlay 悬浮球/信息面板。 */
    devOverlay: "DevOverlay/DevOverlay",
} as const;
export type PackagePath = (typeof PACKAGE_PATHS)[keyof typeof PACKAGE_PATHS];

/** bundle 哨兵资源：触发 bundle 脚本副作用完成注册桥登记。 */
export const SENTINELS = {
    /** 无同名场景资源的 bundle 用 placeholder 哨兵。 */
    placeholder: "placeholder",
} as const;

/** samples 注册桥 unitNodeMappings 的映射键（boot 冒烟路径消费）。 */
export const UNIT_MAPPING_KEYS = {
    /** 自动战斗战场动态单位映射（entry 声明由 game 侧 catalog 提供，冒烟路径固定用此键）。 */
    autoBattle: "auto_battle",
} as const;

/** 场景名（director.loadScene 目标，对齐场景文件名）。 */
export const SCENES = {
    /** 入口场景：启动编排与冒烟分叉所在地。 */
    startup: "startup",
    /** game 场景：默认流程单向切换目标。 */
    game: "game",
} as const;

/**
 * 安全读取 window.location.search：非浏览器（window 缺失）或原生（window 存在
 * 但无 location）时返回空串。统一经此读取，避免消费点各自 typeof window 裸判。
 */
export function getWindowSearch(): string {
    if (typeof window === "undefined" || typeof window.location === "undefined") {
        return "";
    }
    return window.location.search;
}

/**
 * 运行时环境探测（浏览器或 Cocos 原生都视为可启动编排）：`typeof window` 只能
 * 区分浏览器与纯 TS 测试，原生（jsb 提供 window 但可能无 location）需结合
 * sys.isNative。调用方传入 Cocos 的 `sys.isNative`，纯 TS 测试注入 false。
 */
export function isRuntimeEnvironment(isNative: boolean): boolean {
    return isNative === true || typeof window !== "undefined";
}
