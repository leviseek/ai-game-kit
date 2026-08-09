import type { ViewModelNode } from "../../framework";
import type { GameFixture } from "../fixture/GameFixture";

/**
 * 品类呈现器：把夹具状态渲染到真实页面节点。引擎无关——消费 ViewModelNode
 * 契约，不依赖 fgui/cc；节点解析器（FairyGuiViewHandle）由宿主注入。
 */
export interface GamePresenter {
    render(): void;
    dispose(): void;
}

/** 呈现器工厂：按品类装配 ViewModelRenderer 到注入的节点解析器。 */
export type GamePresenterFactory = (
    fixture: GameFixture,
    node: (name: string) => ViewModelNode | undefined,
) => GamePresenter;
