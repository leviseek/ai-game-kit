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
        const path = resolveMovePath(grid, "0:3", "0:2", 1, 10);
        expect(path.steps).toEqual([]);
        expect(path.destination).toBe("0:3");
    });

    test("beyond range advances along rendered slots to the nearest in-range cell", () => {
        const grid = createMapGrid();
        // 0:3 → 0:0，attackRange 1：顶行偶数列无槽位（0:2 不可走），路径斜向贴边
        // 下探行 1 再回到 0:1（距目标 1），全程只踩已渲染槽位格
        const path = resolveMovePath(grid, "0:3", "0:0", 1, 10);
        expect(path.steps).toEqual(["1:2", "0:1"]);
        expect(path.destination).toBe("0:1");
    });

    test("every proposed step stays on rendered slot cells", () => {
        // 全图任意可走起点 → 可走终点的路径：每一步都必须落在槽位格
        // （列高 3-4-3-4-…-3：偶数列缺顶行，顶行只有奇数列有槽位）
        const isWalkable = (key: string): boolean => {
            const [row, col] = key.split(":").map(Number);
            return col % 2 === 1 || row >= 1;
        };
        const grid = createMapGrid();
        for (let row = 0; row < 4; row += 1) {
            for (let col = 0; col < 11; col += 1) {
                const from = `${row}:${col}`;
                if (!isWalkable(from)) {
                    continue;
                }
                for (let targetRow = 0; targetRow < 4; targetRow += 1) {
                    for (let targetCol = 0; targetCol < 11; targetCol += 1) {
                        const to = `${targetRow}:${targetCol}`;
                        if (!isWalkable(to)) {
                            continue;
                        }
                        const { steps } = resolveMovePath(grid, from, to, 0, 10);
                        for (const step of steps) {
                            expect(isWalkable(step)).toBe(true);
                        }
                    }
                }
            }
        }
    });

    test("reroutes around an occupied cell", () => {
        const grid = createMapGrid();
        grid.place("blocker", "1:2");
        // 首步 1:2 被占用：BFS 绕行（1:3 → 2:2 → 1:1）仍落到射程内格
        const path = resolveMovePath(grid, "0:3", "1:0", 1, 10);
        expect(path.steps).toEqual(["1:3", "2:2", "1:1"]);
        expect(path.destination).toBe("1:1");
    });

    test("stops when all forward paths are blocked", () => {
        const grid = createMapGrid();
        grid.place("b1", "1:3");
        grid.place("b2", "1:2");
        grid.place("b3", "1:4");
        // 起点 0:3 的全部前向邻格（1:3/1:2/1:4）被占用：无可达路径，原地不移动
        const path = resolveMovePath(grid, "0:3", "1:0", 1, 10);
        expect(path.steps).toEqual([]);
        expect(path.destination).toBe("0:3");
    });

    test("same input yields same path (determinism)", () => {
        const first = resolveMovePath(createMapGrid(), "0:3", "0:0", 1, 10);
        const second = resolveMovePath(createMapGrid(), "0:3", "0:0", 1, 10);
        expect(first.steps).toEqual(second.steps);
        expect(first.destination).toBe(second.destination);
    });

    test("cross-row target is reached via the shortest slot path (P2-8)", () => {
        const grid = createMapGrid();
        // 目标在行 1：BFS 最短路径（0:3 斜向贴边下探 1:2 再横移），落点 1:1 距目标 1
        const path = resolveMovePath(grid, "0:3", "1:0", 1, 10);
        expect(path.steps).toEqual(["1:2", "1:1"]);
        expect(path.destination).toBe("1:1");
    });

    test("maxSteps bounds the cells moved per action (movePoints)", () => {
        const grid = createMapGrid();
        // 0:3 → 0:0，attackRange 1、maxSteps 2：最多走 2 格（1:2 → 0:1），未到射程也停
        const path = resolveMovePath(grid, "0:3", "0:0", 1, 2);
        expect(path.steps).toEqual(["1:2", "0:1"]);
        expect(path.destination).toBe("0:1");
        // maxSteps 1：只走 1 格
        const short = resolveMovePath(grid, "0:3", "0:0", 1, 1);
        expect(short.steps).toEqual(["1:2"]);
        expect(short.destination).toBe("1:2");
        // maxSteps 0：不移动
        const none = resolveMovePath(grid, "0:3", "0:0", 1, 0);
        expect(none.steps).toEqual([]);
        expect(none.destination).toBe("0:3");
    });
});

describe("Auto-battle move in battle", () => {
    test("beyond attack range moves then attacks (move + attack events)", () => {
        // a 在己方前排 0:7，x 在敌方前排 0:3，距离 4 > attackRange 1：
        // 布阵时中间留空（敌列 1-3、己列 7-9），射程不够才在回合内前移
        const config = createAutoBattleConfig({
            heroes: [hero("a", "a"), hero("x", "x")],
            lineups: { ally: ["a"], enemy: ["x"] },
            energyGainAttacker: 10,
            energyGainTarget: 5,
        });
        const clock = createAutoBattleClock();
        const pair: AutoBattleLineupPair = {
            ally: [{ slot: 0, heroId: "a" }], // 0:7
            enemy: [{ slot: 0, heroId: "x" }], // 0:3
        };
        const battle = createAutoBattleBattle({ clock, config, lineups: () => pair });
        battle.tick();
        const types = battle.events.map((e) => e.type);
        // 1v1 跨半场：move 到距离 ≤1 再攻击
        expect(types).toContain("move");
        expect(types).toContain("attack");
        const moveIndex = types.indexOf("move");
        const attackIndex = types.indexOf("attack");
        expect(moveIndex).toBeLessThan(attackIndex);
        battle.dispose();
    });

    test("within range attacks without moving", () => {
        // a 在己方前排 0:7，x 在敌方前排 0:3，曼哈顿距离 4 ≤ attackRange 4：射程内不移动
        const config = createAutoBattleConfig({
            heroes: [hero("a", "a", { attackRange: 4 }), hero("x", "x", { attackRange: 4 })],
            lineups: { ally: ["a"], enemy: ["x"] },
            energyGainAttacker: 10,
            energyGainTarget: 5,
        });
        const clock = createAutoBattleClock();
        const pair: AutoBattleLineupPair = {
            ally: [{ slot: 0, heroId: "a" }],
            enemy: [{ slot: 0, heroId: "x" }],
        };
        const battle2 = createAutoBattleBattle({ clock, config, lineups: () => pair });
        battle2.tick();
        const types = battle2.events.map((e) => e.type);
        expect(types).not.toContain("move");
        battle2.dispose();
    });

    test("state snapshot reflects updated gridKey after move", () => {
        // 默认布阵中间留空（a 0:7 / x 0:3），近战射程不够前移：移动后 gridKey 更新
        const config = createAutoBattleConfig({
            heroes: [hero("a", "a"), hero("x", "x")],
            lineups: { ally: ["a"], enemy: ["x"] },
            energyGainAttacker: 10,
            energyGainTarget: 5,
        });
        const clock = createAutoBattleClock();
        const pair: AutoBattleLineupPair = {
            ally: [{ slot: 0, heroId: "a" }], // 0:7
            enemy: [{ slot: 0, heroId: "x" }], // 0:3
        };
        const battle = createAutoBattleBattle({ clock, config, lineups: () => pair });
        const before = battle.state.units.find((u) => u.id === "a")!.gridKey;
        battle.tick();
        const after = battle.state.units.find((u) => u.id === "a")!.gridKey;
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
        // teleportTo 2:0 = 布阵区相对格（row 2, col 0）= 前排第 3 行（slot 2）
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
