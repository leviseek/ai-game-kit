import { describe, expect, test } from "bun:test";

// 副作用导入 samples/entry：触发 samples bundle 单点登记，使运行时夹具登记表非空
import "../../../assets/samples/entry";
import { gameFixtureRegistry } from "../../../assets/game/fixture/registry";
import { gameTypeCatalog } from "../../../assets/game/lobby/catalog";

describe("game lobby catalog", () => {
    test("every catalog id aligns with the fixture registry", () => {
        const catalogIds = gameTypeCatalog.map((info) => info.id).sort();
        const registryIds = Object.keys(gameFixtureRegistry()).sort();
        expect(catalogIds).toEqual(registryIds);
    });

    test("card is the only playable game type", () => {
        const playable = gameTypeCatalog
            .filter((info) => info.playable)
            .map((info) => info.id);
        expect(playable).toEqual(["card"]);
    });

    test("card entry matches the card-battle smoke contract", () => {
        const card = gameTypeCatalog.find((info) => info.id === "card");
        expect(card?.playable).toBe(true);
        expect(card?.entry).toEqual({
            route: "card/battle",
            packageName: "CardGame",
            resName: "BattleView",
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
