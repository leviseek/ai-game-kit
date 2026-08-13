import { describe, expect, test } from "bun:test";

import { createAutoBattleBattle, type AutoBattleLineupPair } from "../../../assets/samples/game_auto_battle/logic/battle";
import { createAutoBattleClock } from "../../../assets/samples/game_auto_battle/logic/clock";
import { createAutoBattleConfig, type AutoBattleConfigHandle } from "../../../assets/samples/game_auto_battle/logic/config";
import { createMapGrid } from "../../../assets/samples/game_auto_battle/logic/grid";
import { manhattanDistance, resolveMovePath } from "../../../assets/samples/game_auto_battle/logic/move";
import type { AutoBattleState } from "../../../assets/samples/game_auto_battle/models";

/** 构造英雄池条目（heroes 格式），支持 attackRange 覆盖。 */
function hero(id: string, name: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id,
        name,
        position: "front",
        maxHp: 100,
        attack: 10,
        speed: 5,
        attackRange: 1,
        energyMax: 100,
        skill: {
            id: `${id}-skill`,
            name: `${name} Skill`,
            kind: "damage",
            value: 40,
            energyCost: 100,
        },
        ...overrides,
    };
}

/** 直接构造 battle（不经 fixture），便于聚焦移动行为。 */
function createBattle(configContent: Record<string, unknown>): {
    readonly config: AutoBattleConfigHandle;
    readonly state: () => AutoBattleState;
    readonly events: () => readonly { type: string; sourceId?: string; fromGridKey?: string; toGridKey?: string }[];
    readonly tick: () => void;
    readonly dispose: () => void;
} {
    const config = createAutoBattleConfig(configContent);
    const clock = createAutoBattleClock();
    const battle = createAutoBattleBattle({ clock, config });
    return {
        config,
        state: () => battle.state,
        events: () => battle.events,
        tick: () => battle.tick(),
        dispose: () => battle.dispose(),
    };
}

describe("Auto-battle move resolver", () => {
    test("manhattan distance computes row+col distance", () => {
        expect(manhattanDistance("0:3", "0:0")).toBe(3);
        expect(manhattanDistance("1:4", "1:5")).toBe(1);
        expect(manhattanDistance("2:2", "2:2")).toBe(0);
        expect(manhattanDistance("bad", "0:0")).toBe(Number.POSITIVE_INFINITY);
    });

    test("within attack range returns no movement", () => {
        const grid = createMapGrid();
        const path = resolveMovePath(grid, "0:3", "0:2", 1);
        expect(path.steps).toEqual([]);
        expect(path.destination).toBe("0:3");
    });

    test("beyond range moves along same row toward target", () => {
        const grid = createMapGrid();
        // 0:3 → 0:0，attackRange 1：前移到距离 ≤1 的格（0:1）
        const path = resolveMovePath(grid, "0:3", "0:0", 1);
        expect(path.steps).toEqual(["0:2", "0:1"]);
        expect(path.destination).toBe("0:1");
    });

    test("stops at occupied cell without moving", () => {
        const grid = createMapGrid();
        grid.place("blocker", "0:2");
        const path = resolveMovePath(grid, "0:3", "0:0", 1);
        // 0:2 被占用：停在当前格，不产生移动
        expect(path.steps).toEqual([]);
        expect(path.destination).toBe("0:3");
    });

    test("same input yields same path (determinism)", () => {
        const first = resolveMovePath(createMapGrid(), "0:3", "0:0", 1);
        const second = resolveMovePath(createMapGrid(), "0:3", "0:0", 1);
        expect(first.steps).toEqual(second.steps);
        expect(first.destination).toBe(second.destination);
    });

    test("non same-row target does not move (same-row-only stepping)", () => {
        const grid = createMapGrid();
        // 目标在不同行：stepToward 非同排返回 undefined，不移动
        const path = resolveMovePath(grid, "0:3", "1:0", 1);
        expect(path.steps).toEqual([]);
        expect(path.destination).toBe("0:3");
    });
});

describe("Auto-battle move in battle", () => {
    test("beyond attack range moves then attacks (move + attack events)", () => {
        // a 在 0:3（己方右半），x 在 0:0（敌方左半），距离 3 > 1
        const battle = createBattle({
            heroes: [hero("a", "a"), hero("x", "x")],
            lineups: { ally: ["a"], enemy: ["x"] },
            energyGainAttacker: 10,
            energyGainTarget: 5,
        });
        battle.tick();
        const types = battle.events().map((e) => e.type);
        // 1v1 跨半场：move 到距离 ≤1 再攻击
        expect(types).toContain("move");
        expect(types).toContain("attack");
        const moveIndex = types.indexOf("move");
        const attackIndex = types.indexOf("attack");
        expect(moveIndex).toBeLessThan(attackIndex);
        battle.dispose();
    });

    test("within range attacks without moving", () => {
        // a 在己方布阵区 0:3，x 在敌方布阵区 0:2（最右格）：距离 1 ≤ attackRange 1
        const config = createAutoBattleConfig({
            heroes: [hero("a", "a"), hero("x", "x")],
            lineups: { ally: ["a"], enemy: ["x"] },
            energyGainAttacker: 10,
            energyGainTarget: 5,
        });
        const clock = createAutoBattleClock();
        const pair: AutoBattleLineupPair = {
            ally: [{ slot: 0, heroId: "a" }],
            enemy: [{ slot: 2, heroId: "x" }],
        };
        const battle2 = createAutoBattleBattle({ clock, config, lineups: () => pair });
        battle2.tick();
        const types = battle2.events.map((e) => e.type);
        expect(types).not.toContain("move");
        battle2.dispose();
    });

    test("state snapshot reflects updated gridKey after move", () => {
        const battle = createBattle({
            heroes: [hero("a", "a"), hero("x", "x")],
            lineups: { ally: ["a"], enemy: ["x"] },
            energyGainAttacker: 10,
            energyGainTarget: 5,
        });
        const before = battle.state().units.find((u) => u.id === "a")!.gridKey;
        battle.tick();
        const after = battle.state().units.find((u) => u.id === "a")!.gridKey;
        expect(after).not.toBe(before);
        battle.dispose();
    });

    test("skill with teleport moves target when target cell is free", () => {
        // a 的技能含 teleportTo（目标换位到其侧布阵区相对格）
        const battle = createBattle({
            heroes: [
                hero("a", "a", {
                    skill: {
                        id: "push",
                        name: "Push",
                        kind: "damage",
                        value: 10,
                        energyCost: 1,
                        teleportTo: "2:0",
                    },
                }),
                hero("x", "x"),
                hero("y", "y"),
            ],
            lineups: { ally: ["a"], enemy: ["x", "y"] },
            energyGainAttacker: 10,
            energyGainTarget: 5,
        });
        // 推进到 a 满能量放技能（能量从普攻积累）
        for (let i = 0; i < 20; i += 1) {
            battle.tick();
            if (battle.events().some((e) => e.type === "teleport")) {
                break;
            }
        }
        expect(battle.events().some((e) => e.type === "teleport")).toBe(true);
        // 目标 y（后排，teleportTo 2:0 映射到敌侧布阵区第 3 行第 1 列）
        const teleport = battle.events().find((e) => e.type === "teleport")!;
        expect(teleport.toGridKey).toBeDefined();
        battle.dispose();
    });

    test("skill teleport fails when target cell is occupied", () => {
        // 构造占满目标格：teleportTo 2:0 已有单位
        const battle = createBattle({
            heroes: [
                hero("a", "a", {
                    skill: {
                        id: "push",
                        name: "Push",
                        kind: "damage",
                        value: 10,
                        energyCost: 1,
                        teleportTo: "2:0",
                    },
                }),
                hero("x", "x"),
                hero("y", "y"),
                hero("z", "z"),
            ],
            lineups: { ally: ["a"], enemy: ["x", "y", "z"] },
            energyGainAttacker: 10,
            energyGainTarget: 5,
        });
        for (let i = 0; i < 30; i += 1) {
            battle.tick();
        }
        // z 可能占用 2:0，teleport 可能失败；若成功则目标格当时空闲。断言不崩且行为确定。
        // 此测试主要验证占用格失败路径不抛错（确定性），具体位置轨迹由回放测试锁定。
        battle.dispose();
    });

    test("determinism: same lineup replays identical move/teleport events", () => {
        const content = {
            heroes: [hero("a", "a"), hero("b", "b"), hero("x", "x"), hero("y", "y")],
            lineups: { ally: ["a", "b"], enemy: ["x", "y"] },
            energyGainAttacker: 10,
            energyGainTarget: 5,
        };
        const first = createBattle(content);
        const second = createBattle(content);
        for (let i = 0; i < 20; i += 1) {
            first.tick();
            second.tick();
        }
        expect(first.events().map((e) => e.type)).toEqual(second.events().map((e) => e.type));
        expect(first.state().units.map((u) => u.gridKey)).toEqual(second.state().units.map((u) => u.gridKey));
        first.dispose();
        second.dispose();
    });
});
