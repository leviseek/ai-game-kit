import { describe, expect, test } from "bun:test";

import { FORMATION_GRID_SIZE } from "../../../assets/samples/game_auto_battle/logic/grid";
import { MAX_TEAM_SIZE } from "../../../assets/samples/game_auto_battle/logic/config";
import { editLineup } from "../../../assets/samples/game_auto_battle/logic/lineup";
import type { AutoBattleLineup } from "../../../assets/samples/game_auto_battle/models";

/** 构造定长空编队（空槽为 null），长度为布阵区容量 FORMATION_GRID_SIZE。 */
function emptyLineup(): AutoBattleLineup {
    return { slots: Array.from({ length: FORMATION_GRID_SIZE }, () => null) };
}

/** 构造带指定占用槽的编队：{[slot]: heroId}。 */
function lineupWith(occupied: Readonly<Record<number, string>>): AutoBattleLineup {
    const slots = Array.from<unknown, string | null>({ length: FORMATION_GRID_SIZE }, () => null);
    for (const [slot, heroId] of Object.entries(occupied)) {
        slots[Number(slot)] = heroId;
    }
    return { slots };
}

describe("Auto-battle lineup editor", () => {
    test("fills an empty slot", () => {
        const result = editLineup(emptyLineup(), {
            type: "fill",
            slot: 0,
            heroId: "h1",
        });

        expect(result.slots[0]).toBe("h1");
        expect(result.slots.every((slot, i) => i === 0 || slot === null)).toBe(true);
    });

    test("replaces an occupied slot", () => {
        const result = editLineup(lineupWith({ 0: "h1" }), {
            type: "fill",
            slot: 0,
            heroId: "h2",
        });

        expect(result.slots[0]).toBe("h2");
    });

    test("moving a hero to another slot keeps it unique", () => {
        const result = editLineup(lineupWith({ 0: "h1", 1: "h2" }), {
            type: "fill",
            slot: 1,
            heroId: "h1",
        });

        // 原槽清空，目标槽填入，英雄不重复占用
        expect(result.slots[0]).toBeNull();
        expect(result.slots[1]).toBe("h1");
    });

    test("filling the same hero into its own slot is idempotent", () => {
        const lineup = lineupWith({ 0: "h1", 1: "h2" });
        const result = editLineup(lineup, {
            type: "fill",
            slot: 0,
            heroId: "h1",
        });

        expect(result).toBe(lineup);
    });

    test("removing a hero empties the slot", () => {
        const result = editLineup(lineupWith({ 0: "h1" }), {
            type: "remove",
            slot: 0,
        });

        expect(result.slots[0]).toBeNull();
    });

    test("removing an empty slot is a no-op and returns the same object", () => {
        const lineup = emptyLineup();
        expect(editLineup(lineup, { type: "remove", slot: 0 })).toBe(lineup);
    });

    test("fill beyond the formation size is rejected", () => {
        const lineup = lineupWith({ 0: "h1" });
        const result = editLineup(lineup, {
            type: "fill",
            slot: FORMATION_GRID_SIZE,
            heroId: "h2",
        });

        // 拒绝 = 返回原对象（引用不变），槽位不超出布阵区容量
        expect(result).toBe(lineup);
    });

    test("fill beyond the deploy cap is rejected when the target slot is empty", () => {
        // 已上阵 MAX_TEAM_SIZE 个英雄，再填新英雄到空槽应被拒
        const occupied: Record<number, string> = {};
        for (let slot = 0; slot < MAX_TEAM_SIZE; slot += 1) {
            occupied[slot] = `h${slot}`;
        }
        const lineup = lineupWith(occupied);
        const result = editLineup(lineup, {
            type: "fill",
            slot: MAX_TEAM_SIZE,
            heroId: "new",
        });

        expect(result).toBe(lineup);
    });

    test("replacing an occupied slot is allowed even when the deploy cap is reached", () => {
        const occupied: Record<number, string> = {};
        for (let slot = 0; slot < MAX_TEAM_SIZE; slot += 1) {
            occupied[slot] = `h${slot}`;
        }
        const lineup = lineupWith(occupied);
        const result = editLineup(lineup, {
            type: "fill",
            slot: 0,
            heroId: "new",
        });

        expect(result.slots[0]).toBe("new");
    });

    test("moving a hero into an empty slot is allowed when the deploy cap is reached", () => {
        // 满编后把 h0 从 slot0 移到空 slot6（不增加上阵数）
        const occupied: Record<number, string> = {};
        for (let slot = 0; slot < MAX_TEAM_SIZE; slot += 1) {
            occupied[slot] = `h${slot}`;
        }
        const lineup = lineupWith(occupied);
        const result = editLineup(lineup, {
            type: "fill",
            slot: MAX_TEAM_SIZE,
            heroId: "h0",
        });

        expect(result.slots[0]).toBeNull();
        expect(result.slots[MAX_TEAM_SIZE]).toBe("h0");
    });

    test("fill with a negative slot is rejected", () => {
        const lineup = lineupWith({ 0: "h1" });
        const result = editLineup(lineup, {
            type: "fill",
            slot: -1,
            heroId: "h2",
        });

        expect(result).toBe(lineup);
    });

    test("does not mutate the input lineup", () => {
        const lineup = lineupWith({ 0: "h1" });
        const snapshot = [...lineup.slots];

        editLineup(lineup, { type: "fill", slot: 1, heroId: "h2" });

        expect(lineup.slots).toEqual(snapshot);
    });
});
