import { describe, expect, test } from "bun:test";

// 副作用导入 samples/entry：触发 samples bundle 单点登记，使运行时夹具登记表非空
import "../../../assets/samples/entry";
import { gameFixtureRegistry } from "../../../assets/game/fixture/registry";
import {
    AUTO_BATTLE_BATTLE_ENTRY,
    gameTypeCatalog,
} from "../../../assets/game/lobby/catalog";

describe("game lobby catalog", () => {
    test("every catalog id aligns with the fixture registry", () => {
        const catalogIds = gameTypeCatalog.map((info) => info.id).sort();
        const registryIds = Object.keys(gameFixtureRegistry()).sort();
        expect(catalogIds).toEqual(registryIds);
    });

    test("card and auto_battle are the playable game types", () => {
        const playable = gameTypeCatalog
            .filter((info) => info.playable)
            .map((info) => info.id);
        expect(playable).toEqual(["card", "auto_battle"]);
    });

    test("card entry matches the card-battle smoke contract", () => {
        const card = gameTypeCatalog.find((info) => info.id === "card");
        expect(card?.playable).toBe(true);
        // CardBattleView 用普通视图解析器：resolver 缺省 "view"，不声明
        expect(card?.entry).toEqual({
            route: "card/battle",
            packageName: "CardGame",
            resName: "CardBattleView",
        });
    });

    test("auto_battle entry opens the lineup editor first, then the battle page", () => {
        const autoBattle = gameTypeCatalog.find((info) => info.id === "auto_battle");
        expect(autoBattle?.playable).toBe(true);
        // 进入品类先落编队页编辑布阵：LineupEditorView 含候选 GList，声明列表解析器
        expect(autoBattle?.entry).toEqual({
            route: "auto_battle/lineup",
            packageName: "AutoBattle",
            resName: "LineupEditorView",
            resolver: "list",
        });
        // 编队页点"开始战斗"后切到战场页：AutoBattleView 按存活单位动态实例化，
        // 声明 dynamic 解析器并携带 samples 注册桥映射键
        expect(AUTO_BATTLE_BATTLE_ENTRY).toEqual({
            route: "auto_battle/battle",
            packageName: "AutoBattle",
            resName: "AutoBattleView",
            resolver: "dynamic",
            mappingKey: "auto_battle",
        });
    });

    test("unplayable game types have no real entry", () => {
        for (const info of gameTypeCatalog) {
            if (!info.playable) {
                expect(info.entry).toBeUndefined();
            }
        }
    });
});
