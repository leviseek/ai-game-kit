import { registerBundle } from "../framework";
import { gameTypeCatalog } from "./lobby/catalog";
import { sceneMap } from "./fixture/scene";

// game bundle 顶层副作用：登记品类清单与场景资源映射（smokes 由 Task 7 追加）。
registerBundle("game", {
    catalog: gameTypeCatalog,
    sceneResources: sceneMap,
});
