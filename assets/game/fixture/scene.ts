import type { SceneResources } from "../../framework";

/**
 * 场景映射清单：场景标识 → 该场景流转所需的资源（单个 Bundle 下的路径集合）。
 * game 场景为空壳，仅登记 ui bundle（fgui 包目录）的占位资源，使切换后 bundle
 * 在场景作用域内保持加载、可被列表页/品类包复用；显式声明、不自动扫描，新增
 * 场景在此登记（对齐 gameTypeCatalog/LOBBY_LIST_ENTRY 模式）。
 */
export const sceneMap: Readonly<Record<string, SceneResources>> = Object.freeze({
    game: Object.freeze({ bundle: "ui", paths: ["placeholder"] }),
});
