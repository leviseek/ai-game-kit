import { registerBundle } from "../framework";
import { createCardFixture } from "./game_card/assembly";
import { createFightFixture } from "./game_fight/assembly";
import { createIdleFixture } from "./game_idle/assembly";
import { createRpgFixture } from "./game_rpg/assembly";
import { createTycoonFixture } from "./game_tycoon/assembly";
import { createAutoBattleFixture } from "./game_auto_battle/assembly";
import { createCardBattlePresenter } from "./game_card/view/presenter";
import { createAutoBattlePresenter } from "./game_auto_battle/view/presenter";
import { runCardBattleSmoke } from "./game_card/smoke";
import { runAutoBattleSmoke } from "./game_auto_battle/smoke";

// samples bundle 顶层副作用：单点合并登记品类模块描述符，避免多文件各自
// register 互相覆盖。各 game_*/assembly.ts 不自行 registerBundle。
registerBundle("samples", {
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
        auto_battle: createAutoBattlePresenter,
    },
    smokes: {
        cardBattle: runCardBattleSmoke,
        autoBattle: runAutoBattleSmoke,
    },
});
