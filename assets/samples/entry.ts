import { registerBundle } from "../framework";
import { createCardFixture } from "./game_card/assembly";
import { createFightFixture } from "./game_fight/assembly";
import { createIdleFixture } from "./game_idle/assembly";
import { createRpgFixture } from "./game_rpg/assembly";
import { createTycoonFixture } from "./game_tycoon/assembly";
import { createCardBattlePresenter } from "./game_card/view/presenter";

// samples bundle 顶层副作用：单点合并登记品类模块描述符，避免多文件各自
// register 互相覆盖。各 game_*/assembly.ts 不自行 registerBundle。
registerBundle("samples", {
    fixtures: {
        card: createCardFixture,
        rpg: createRpgFixture,
        idle: createIdleFixture,
        tycoon: createTycoonFixture,
        fight: createFightFixture,
    },
    presenters: { card: createCardBattlePresenter },
});
