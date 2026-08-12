import { registerBundle } from "../framework";
import { createCardFixture } from "./game_card/assembly";
import { createFightFixture } from "./game_fight/assembly";
import { createIdleFixture } from "./game_idle/assembly";
import { createRpgFixture } from "./game_rpg/assembly";
import { createTycoonFixture } from "./game_tycoon/assembly";
import { createAutoBattleFixture } from "./game_auto_battle/assembly";
import { createCloseDialogFeature } from "./game_fui_demo/assembly";
import { createCardBattlePresenter } from "./game_card/view/presenter";
import { createLineupEditorPresenter } from "./game_auto_battle/view/LineupPresenter";
import { runCardBattleSmoke } from "./game_card/smoke";
import { runAutoBattleSmoke } from "./game_auto_battle/smoke";
import { AUTO_BATTLE_DYNAMIC_NODE_MAPPINGS } from "./game_auto_battle/view/UnitNodeMapping";

// samples bundle 顶层副作用：单点合并登记品类模块描述符，避免多文件各自
// register 互相覆盖。各 game_*/assembly.ts 不自行 registerBundle。
export const SAMPLES_BUNDLE_DESCRIPTOR = Object.freeze({
    fixtures: {
        card: createCardFixture,
        rpg: createRpgFixture,
        idle: createIdleFixture,
        tycoon: createTycoonFixture,
        fight: createFightFixture,
        auto_battle: createAutoBattleFixture,
    },
    presenters: {
        card: createCardBattlePresenter,
        // auto_battle 进入先落编队页（编辑布阵），点"开始战斗"经会话导航切战场页
        auto_battle: createLineupEditorPresenter,
    },
    smokes: {
        cardBattle: runCardBattleSmoke,
        autoBattle: runAutoBattleSmoke,
    },
    // 真实 fgui 页面节点映射：boot 装配层经 lookupBundle 运行时读取（不静态
    // import game bundle，保持 boot 边界）；当前只有 auto_battle 战场需要
    // 动态实例化（单位 UnitSlot + 命中反馈特效）
    unitNodeMappings: {
        auto_battle: AUTO_BATTLE_DYNAMIC_NODE_MAPPINGS,
    },
    // CloseDialog Feature 装配入口：向组合根 registrar 注册 Store + facade binder
    createCloseDialogFeature,
});

registerBundle("samples", SAMPLES_BUNDLE_DESCRIPTOR);
