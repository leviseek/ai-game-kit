import type { ViewModelNode } from "../../framework";
import type { FairyGuiListHandle } from "../../framework";
import type { GameFixture } from "../fixture/GameFixture";
import type { GameEntryInfo } from "./catalog";

/**
 * 品类呈现器：把夹具状态渲染到真实页面节点。引擎无关——消费 ViewModelNode
 * 契约，不依赖 fgui/cc；节点解析器（FairyGuiViewHandle）由宿主注入。
 */
export interface GamePresenter {
    render(): void;
    dispose(): void;
}

/**
 * 会话内页面导航：多页面品类（如 auto_battle 编队页 → 战场页）经它切换
 * 入口页并重装配呈现器；单页面品类不使用。
 */
export interface GameSessionNavigator {
    /** 关闭当前呈现器与页面，打开新入口页并装配新呈现器；fire-and-forget。 */
    openEntry(entry: GameEntryInfo, presenterFactory: GamePresenterFactory): void;
}

/** 呈现器工厂：按品类装配 ViewModelRenderer 到注入的节点解析器；可选注入列表解析器。 */
export type GamePresenterFactory = (
    fixture: GameFixture,
    node: (name: string) => ViewModelNode | undefined,
    session?: GameSessionNavigator,
    list?: (name: string) => FairyGuiListHandle<unknown> | undefined,
) => GamePresenter;
