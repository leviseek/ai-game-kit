import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import {
    AUTO_BATTLE_ASSEMBLY_EXISTS,
    AUTO_BATTLE_ASSEMBLY_FILE,
    AUTO_BATTLE_FRAMEWORK_ROOT,
    AUTO_BATTLE_PROJECT_ROOT,
    configContent,
    driveUniformLifecycle,
    loadCreateAutoBattleFixture,
    unit,
} from "../support/auto-battle-fixture";

describe("Auto-battle fixture contract file", () => {
    test("declares createAutoBattleFixture without cc or fgui imports", () => {
        expect(
            existsSync(AUTO_BATTLE_ASSEMBLY_FILE),
            "assets/game_auto_battle/assembly.ts not implemented yet (task 3.1)",
        ).toBe(true);

        if (!existsSync(AUTO_BATTLE_ASSEMBLY_FILE)) {
            return;
        }

        const source = readFileSync(AUTO_BATTLE_ASSEMBLY_FILE, "utf8");

        expect(
            source,
        ).toMatch(/\bexport\s+(?:function|const)\s+createAutoBattleFixture\b/);
        // 夹具组合层只经框架根入口与游戏层公共装配入口导入（design decision 3）
        expect(source).not.toMatch(/from\s*["']cc(?:["']|\/)/);
        expect(source).not.toMatch(/from\s*["']fairygui/);
    });
});

describe.skipIf(!AUTO_BATTLE_ASSEMBLY_EXISTS)(
    "Auto-battle fixture composition",
    () => {
        test("returns a GameFixture exposing the uniform lifecycle with id auto_battle", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture();

            expect(fixture.id).toBe("auto_battle");
            expect(Array.isArray(fixture.modules)).toBe(true);

            for (const seam of [
                "start",
                "pause",
                "resume",
                "failRollback",
                "dispose",
            ] as const) {
                expect(typeof fixture[seam]).toBe("function");
            }

            await expect(driveUniformLifecycle(fixture)).resolves.toEqual([
                "start",
                "pause",
                "resume",
                "dispose",
            ]);
        });

        test("declares the exact auto-battle module list", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture();

            // 精确断言装配清单：时钟/配置/战斗/技能/阵列/UI 六类能力模块；
            // 未声明能力（音频等）不参与装配
            expect(fixture.modules.map((m) => m.id)).toEqual([
                "auto_battle.clock",
                "auto_battle.config",
                "auto_battle.battle",
                "auto_battle.skills",
                "auto_battle.formation",
                "auto_battle.ui",
            ]);
        });

        test("clock advance rejects negative values", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture();
            await fixture.start();

            // 时钟只应正向推进：负值推进会破坏事件时间单调与确定性
            expect(() => fixture.clock.advance(-1)).toThrow();

            await fixture.dispose();
        });

        test("config rejects invalid values at construction time", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();

            const malformed = [
                unit("a", "A", { maxHp: Number.NaN }),
                unit("a", "A", { attack: Number.POSITIVE_INFINITY }),
                unit("a", "A", { speed: -1 }),
                unit("a", "A", { energyMax: 0 }),
                unit("a", "A", { position: "sideways" }),
                unit("a", "A", {
                    skill: { id: "s", name: "S", kind: "unknown", value: 1, energyCost: 1 },
                }),
                unit("a", "A", {
                    skill: { id: "s", name: "S", kind: "damage", value: -5, energyCost: 1 },
                }),
                unit("a", "A", {
                    skill: { id: "s", name: "S", kind: "damage", value: 1, energyCost: 0 },
                }),
            ];

            for (const bad of malformed) {
                expect(() =>
                    createAutoBattleFixture({
                        configContent: configContent({ ally: [bad] }),
                    }),
                ).toThrow();
            }

            // 能量规则非法值抛错
            expect(() =>
                createAutoBattleFixture({
                    configContent: configContent({ energyGainAttacker: Number.NaN }),
                }),
            ).toThrow();

            // 空队抛错（每队至少一个单位）
            expect(() =>
                createAutoBattleFixture({
                    configContent: configContent({ ally: [] }),
                }),
            ).toThrow();

            // 超规模抛错：MVP 固定 6 静态槽位，每队至多 3 单位，超规模会"参战不渲染"
            expect(() =>
                createAutoBattleFixture({
                    configContent: configContent({
                        ally: [
                            unit("a0", "Tank"),
                            unit("a1", "Mage"),
                            unit("a2", "Priest"),
                            unit("a3", "Extra"),
                        ],
                    }),
                }),
            ).toThrow();
            expect(() =>
                createAutoBattleFixture({
                    configContent: configContent({
                        enemy: [
                            unit("e0", "Grunt"),
                            unit("e1", "Raider"),
                            unit("e2", "Shaman"),
                            unit("e3", "Extra"),
                        ],
                    }),
                }),
            ).toThrow();
        });

        test("restart resets the battle, its event log and is idempotent", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({ configContent: configContent() });
            await fixture.start();

            // 造成伤害并积累能量
            fixture.battle.tick();
            fixture.battle.tick();
            expect(fixture.battle.state.units.some((u) => u.energy > 0)).toBe(true);
            expect(fixture.battle.events.length).toBeGreaterThan(0);

            fixture.battle.restart();
            let state = fixture.battle.state;
            expect(state.round).toBe(1);
            expect(state.phase).toBe("fighting");
            expect(state.result).toBeUndefined();
            for (const unit of state.units) {
                expect(unit.hp).toBe(unit.maxHp);
                expect(unit.energy).toBe(0);
            }
            // 重开即新对局：事件日志只含本局记录（restart + round-start），旧对局不残留
            expect(fixture.battle.events.map((e) => e.type)).toEqual([
                "restart",
                "round-start",
            ]);

            // 幂等：再次重开状态保持一致
            fixture.battle.restart();
            state = fixture.battle.state;
            expect(state.round).toBe(1);
            expect(
                state.units.every((u) => u.hp === u.maxHp && u.energy === 0),
            ).toBe(true);
            expect(fixture.battle.events.map((e) => e.type)).toEqual([
                "restart",
                "round-start",
            ]);

            await fixture.dispose();
        });

        test("ViewModel rendering reflects battle state on the view nodes", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [unit("a", "A", { position: "front", maxHp: 100, attack: 10, speed: 5, energyMax: 100 })],
                    enemy: [unit("x", "X", { position: "front", maxHp: 100, attack: 1, speed: 4, energyMax: 100 })],
                }),
            });
            await fixture.start();

            fixture.viewModel.render();

            // 初始状态映射到静态槽位节点（先己方后敌方）
            expect(fixture.viewModel.node("txt_round").text).toBe("第 1 回合");
            expect(fixture.viewModel.node("txt_unit_0_name").text).toBe("A");
            expect(fixture.viewModel.node("txt_unit_0_hp").text).toBe("HP 100/100");
            expect(fixture.viewModel.node("bar_unit_0_hp").progress).toBe(1);
            expect(fixture.viewModel.node("bar_unit_0_energy").progress).toBe(0);
            expect(fixture.viewModel.node("txt_result").visible).toBe(false);

            // 一回合后：敌方受击血量下降、攻击方能量增长
            fixture.battle.tick();
            fixture.viewModel.render();
            expect(fixture.viewModel.node("txt_unit_1_hp").text).toBe("HP 90/100");
            expect(fixture.viewModel.node("bar_unit_0_energy").progress).toBe(0.1);

            await fixture.dispose();
        });

        test("the restart command binding resets the battle", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({ configContent: configContent() });
            await fixture.start();

            fixture.battle.tick();
            expect(fixture.battle.state.units[1]?.hp).toBeLessThan(100);

            fixture.viewModel.render();
            fixture.viewModel.node("btn_restart").clickHandler?.();
            fixture.viewModel.render();

            const state = fixture.battle.state;
            expect(
                state.units.every((u) => u.hp === u.maxHp && u.energy === 0),
            ).toBe(true);

            await fixture.dispose();
        });

        test("the default config terminates naturally as a win", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            // 缺省 3v3 配置是玩家从 Lobby 进入的第一场战斗：锁定其自然终局且为胜利
            const fixture = createAutoBattleFixture();
            await fixture.start();

            let guard = 0;
            while (fixture.battle.state.phase === "fighting" && guard < 1000) {
                fixture.battle.tick();
                guard += 1;
            }
            const state = fixture.battle.state;
            expect(guard).toBeLessThan(1000);
            expect(state.phase).toBe("over");
            expect(state.result).toBe("win");

            await fixture.dispose();
        });
    },
);

describe("Auto-battle framework boundary", () => {
    test("the framework layer declares no auto-battle business models", () => {
        // 负向断言：自动战斗单位/技能/阵列等业务模型只允许存在于游戏层，
        // 框架层不出现对应类型声明（含裸名与 `AutoBattle` 前缀名）。
        const modelPattern =
            /\b(?:interface|class|type|enum)\s+(?:AutoBattle\w*)\b/;

        const offenders: string[] = [];
        const collect = (directory: string): void => {
            for (const entry of readdirSync(directory, { withFileTypes: true })) {
                const path = resolve(directory, entry.name);
                if (entry.isDirectory()) {
                    collect(path);
                } else if (entry.isFile() && path.endsWith(".ts")) {
                    const source = readFileSync(path, "utf8");
                    if (modelPattern.test(source)) {
                        offenders.push(path.replace(`${AUTO_BATTLE_PROJECT_ROOT}\\`, ""));
                    }
                }
            }
        };

        collect(AUTO_BATTLE_FRAMEWORK_ROOT);
        expect(offenders).toEqual([]);
    });
});
