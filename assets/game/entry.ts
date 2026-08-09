import { registerBundle } from "../framework";
import { gameTypeCatalog } from "./lobby/catalog";
import { createGameListFlow } from "./lobby/list";
import { sceneMap } from "./fixture/scene";
import { runFixtureSmoke } from "./fixture/smoke";
import { runFixturePerf } from "./fixture/perf";

// game bundle 顶层副作用：登记品类清单、场景资源映射与列表页流工厂，
// 以及通用冒烟运行器（fixture/perf，通用、只读注册桥）。
registerBundle("game", {
    catalog: gameTypeCatalog,
    sceneResources: sceneMap,
    createListFlow: createGameListFlow,
    smokes: { fixture: runFixtureSmoke, perf: runFixturePerf },
});
