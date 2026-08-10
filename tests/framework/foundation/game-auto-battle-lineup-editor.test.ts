import { describe, expect, test } from "bun:test";

import { MemoryPlatform } from "../../../assets/framework/adapters/memory/MemoryPlatform";
import {
    AUTO_BATTLE_ASSEMBLY_EXISTS,
    loadCreateAutoBattleFixture,
} from "../support/auto-battle-fixture";

/** 构造英雄池条目。 */
function hero(id: string, name: string): Record<string, unknown> {
    return {
        id,
        name,
        position: "front",
        maxHp: 100,
        attack: 10,
        speed: 5,
        energyMax: 100,
        skill: {
            id: `${id}-skill`,
            name: `${name} Skill`,
            kind: "damage",
            value: 40,
            energyCost: 100,
        },
    };
}

/** 编队场景配置：池含 a..e，初始己方 [a,b]、敌方 [e]，候选 = 池中非敌方英雄。 */
function lineupContent(): Record<string, unknown> {
    return {
        heroes: ["a", "b", "c", "d", "e"].map((id) => hero(id, id)),
        lineups: { ally: ["a", "b"], enemy: ["e"] },
        energyGainAttacker: 10,
        energyGainTarget: 5,
    };
}

describe.skipIf(!AUTO_BATTLE_ASSEMBLY_EXISTS)(
    "Auto-battle lineup editor commands",
    () => {
        test("selectHero fills the first empty slot", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: lineupContent(),
            });
            await fixture.start();

            fixture.lineup.selectHero("c");
            expect(fixture.lineup.value.slots[0]).toBe("a");
            expect(fixture.lineup.value.slots[1]).toBe("b");
            expect(fixture.lineup.value.slots[2]).toBe("c");

            await fixture.dispose();
        });

        test("selecting a slot then a hero replaces that occupied slot", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: lineupContent(),
            });
            await fixture.start();

            fixture.lineup.selectSlot(1);
            fixture.lineup.selectHero("c");
            expect(fixture.lineup.value.slots[1]).toBe("c");
            // 原英雄被替换（英雄唯一性：不在其它槽重复出现）
            expect(fixture.lineup.value.slots.includes("b")).toBe(false);

            await fixture.dispose();
        });

        test("removeFromSlot removes the hero from that slot", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: lineupContent(),
            });
            await fixture.start();

            fixture.lineup.removeFromSlot(0);
            expect(fixture.lineup.value.slots[0]).toBeNull();
            expect(fixture.lineup.value.slots[1]).toBe("b");

            await fixture.dispose();
        });

        test("edits persist to the store and are restored after a restart", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const storage = new MemoryPlatform();
            const fixture = createAutoBattleFixture({
                configContent: lineupContent(),
                storage,
            });
            await fixture.start();

            fixture.lineup.selectHero("c");
            expect(fixture.lineup.store.currentVersion).toBeGreaterThan(0);

            // 新夹具 + 同一存储：初始用配置编队，restoreLineup 恢复上次编辑
            const restarted = createAutoBattleFixture({
                configContent: lineupContent(),
                storage,
            });
            await restarted.start();
            expect(restarted.lineup.value.slots[2]).toBeNull();

            await restarted.lineup.restoreLineup();
            expect(restarted.lineup.value.slots[2]).toBe("c");

            await fixture.dispose();
            await restarted.dispose();
        });

        test("startBattle reopens the battle with the current lineup", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: lineupContent(),
            });
            await fixture.start();

            fixture.lineup.selectHero("c");
            fixture.lineup.startBattle();

            const allyIds = fixture.battle.state.units
                .filter((u) => u.side === "ally")
                .map((u) => u.id);
            expect(allyIds).toEqual(["a", "b", "c"]);

            await fixture.dispose();
        });
    },
);
