import { registerBundle } from "../framework";
import { gameTypeCatalog } from "./lobby/catalog";
import { createGameListFlow } from "./lobby/list";
import { sceneMap } from "./fixture/scene";

// game bundle 顶层副作用：登记品类清单、场景资源映射与列表页流工厂
// （smokes 由 Task 7 追加）。
registerBundle("game", {
    catalog: gameTypeCatalog,
    sceneResources: sceneMap,
    createListFlow: createGameListFlow,
});
