import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

import type { GameFixture } from "../../../assets/game/fixture/GameFixture";
import type { UiNavigator } from "../../../assets/framework";

const projectRoot = resolve(import.meta.dir, "../../..");
const assemblyFile = resolve(
    projectRoot,
    "assets/samples/game_auto_battle/assembly.ts",
);
const assemblyExists = existsSync(assemblyFile);
const frameworkRoot = resolve(projectRoot, "assets/framework");

// ---- 自动战斗夹具目标契约（task 1.1 锁定，task 3.1 实现） ----

type AutoBattleSide = "ally" | "enemy";
type AutoBattlePosition = "front" | "mid" | "back";
type AutoBattleSkillKind = "damage" | "heal";
type AutoBattlePhase = "fighting" | "over";

/** 技能配置：伤害或治疗由 kind 区分，energyCost 决定满能量释放阈值。 */
interface AutoBattleSkill {
    readonly id: string;
    readonly name: string;
    readonly kind: AutoBattleSkillKind;
    readonly value: number;
    readonly energyCost: number;
}

/** 单位静态配置：属性与技能由配置表驱动。 */
interface AutoBattleUnit {
    readonly id: string;
    readonly name: string;
    readonly side: AutoBattleSide;
    readonly position: AutoBattlePosition;
    /** 队内阵列序号（0-2）。 */
    readonly index: number;
    readonly maxHp: number;
    readonly attack: number;
    readonly speed: number;
    readonly energyMax: number;
    readonly skill: AutoBattleSkill;
}

/** 战斗中的单位运行时快照：静态属性 + 当前 HP/能量。 */
interface AutoBattleUnitState extends AutoBattleUnit {
    readonly hp: number;
    readonly energy: number;
}

type AutoBattleEventType =
    | "round-start"
    | "attack"
    | "skill-damage"
    | "skill-heal"
    | "unit-dead"
    | "battle-over"
    | "restart";

/** 战斗事件：seq 保序，time 为事件发生时模拟时钟读数。 */
interface AutoBattleEvent {
    readonly seq: number;
    readonly type: AutoBattleEventType;
    readonly time: number;
    readonly sourceId: string;
    readonly targetId?: string;
    readonly value?: number;
    readonly round?: number;
    readonly result?: "win" | "lose";
}

interface AutoBattleState {
    readonly round: number;
    readonly phase: AutoBattlePhase;
    /** 当前行动序列（单位 id，按速度降序快照）。 */
    readonly order: readonly string[];
    readonly actionIndex: number;
    readonly result: "win" | "lose" | undefined;
    readonly units: readonly AutoBattleUnitState[];
}

interface AutoBattleClock {
    now(): number;
    advance(milliseconds: number): void;
}

interface AutoBattleFixtureOptions {
    /** 可控模拟时钟：缺省为内建时钟（从 0 开始，测试经 fixture.clock.advance 推进）。 */
    readonly clock?: AutoBattleClock;
    /** 配置内容：驱动单位/技能/能量规则；缺省为夹具内建缺省配置。 */
    readonly configContent?: Record<string, unknown>;
    /** 事件回调：战斗事件广播接缝（测试据此断言回放顺序）。 */
    readonly onEvent?: (event: AutoBattleEvent) => void;
}

interface AutoBattleViewNode {
    text: string | undefined;
    progress: number | undefined;
    visible: boolean | undefined;
    clickHandler: (() => void) | undefined;
}

interface AutoBattleFixtureHooks {
    readonly battle: {
        readonly state: AutoBattleState;
        tick(): void;
        /** 重置对局到初始状态（重开按钮命令），幂等。 */
        restart(): void;
        /** 事件回放日志：按发生顺序完整记录。 */
        readonly events: readonly AutoBattleEvent[];
    };
    readonly clock: AutoBattleClock;
    readonly config: {
        readonly ally: readonly AutoBattleUnit[];
        readonly enemy: readonly AutoBattleUnit[];
    };
    readonly navigator: UiNavigator;
    readonly viewModel: {
        readonly node: (name: string) => AutoBattleViewNode;
        render(): void;
    };
}

type AutoBattleFixture = GameFixture & AutoBattleFixtureHooks;
type CreateAutoBattleFixture = (
    options?: AutoBattleFixtureOptions,
) => AutoBattleFixture;

async function loadCreateAutoBattleFixture(): Promise<CreateAutoBattleFixture> {
    const mod = (await import(pathToFileURL(assemblyFile).href)) as {
        createAutoBattleFixture: CreateAutoBattleFixture;
    };
    return mod.createAutoBattleFixture;
}

// ---- 测试配置构造：默认 1v1，行为测试注入定制单位/规则 ----

function unit(
    id: string,
    name: string,
    overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
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
        ...overrides,
    };
}

function configContent(opts: {
    ally?: readonly Record<string, unknown>[];
    enemy?: readonly Record<string, unknown>[];
    energyGainAttacker?: number;
    energyGainTarget?: number;
} = {}): Record<string, unknown> {
    return {
        teams: {
            ally: opts.ally ?? [unit("a", "Tank")],
            enemy: opts.enemy ?? [unit("e", "Slime")],
        },
        energyGainAttacker: opts.energyGainAttacker ?? 10,
        energyGainTarget: opts.energyGainTarget ?? 5,
    };
}

// ---- 统一驱动：与 8.6 统一生命周期测试相同的接缝调用顺序 ----

async function driveUniformLifecycle(fixture: GameFixture): Promise<string[]> {
    const steps: string[] = [];
    await fixture.start();
    steps.push("start");
    await fixture.pause();
    steps.push("pause");
    await fixture.resume();
    steps.push("resume");
    await fixture.dispose();
    steps.push("dispose");
    return steps;
}

describe("Auto-battle fixture contract file", () => {
    test("declares createAutoBattleFixture without cc or fgui imports", () => {
        expect(
            existsSync(assemblyFile),
            "assets/game_auto_battle/assembly.ts not implemented yet (task 3.1)",
        ).toBe(true);

        if (!existsSync(assemblyFile)) {
            return;
        }

        const source = readFileSync(assemblyFile, "utf8");

        expect(
            source,
        ).toMatch(/\bexport\s+(?:function|const)\s+createAutoBattleFixture\b/);
        // 夹具组合层只经框架根入口与游戏层公共装配入口导入（design decision 3）
        expect(source).not.toMatch(/from\s*["']cc(?:["']|\/)/);
        expect(source).not.toMatch(/from\s*["']fairygui/);
    });
});

describe.skipIf(!assemblyExists)(
    "Auto-battle fixture composition capabilities",
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

        test("a round advances after every alive unit has acted once", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            // 6 存活单位全部普攻不致死（低攻击高 HP），保证一轮内无人阵亡
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [
                        unit("a0", "Tank", { position: "front", maxHp: 100, attack: 1, speed: 6, energyMax: 1000 }),
                        unit("a1", "Mage", { position: "mid", maxHp: 100, attack: 1, speed: 5, energyMax: 1000 }),
                        unit("a2", "Priest", { position: "back", maxHp: 100, attack: 1, speed: 4, energyMax: 1000 }),
                    ],
                    enemy: [
                        unit("e0", "Grunt", { position: "front", maxHp: 100, attack: 1, speed: 3, energyMax: 1000 }),
                        unit("e1", "Raider", { position: "mid", maxHp: 100, attack: 1, speed: 2, energyMax: 1000 }),
                        unit("e2", "Shaman", { position: "back", maxHp: 100, attack: 1, speed: 1, energyMax: 1000 }),
                    ],
                }),
            });
            await fixture.start();

            // 6 单位各行动一次后序列耗尽，仍未进入下一回合
            for (let index = 0; index < 6; index += 1) {
                fixture.battle.tick();
            }
            expect(fixture.battle.state.round).toBe(1);

            // 序列耗尽后的下一次 tick 进入第 2 回合并按存活单位重建序列
            fixture.battle.tick();
            expect(fixture.battle.state.round).toBe(2);

            await fixture.dispose();
        });

        test("the action order is speed-descending and equal speeds stay stable", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [
                        unit("slow", "Slow", { position: "front", maxHp: 100, attack: 1, speed: 1, energyMax: 1000 }),
                    ],
                    enemy: [
                        unit("fast", "Fast", { position: "front", maxHp: 100, attack: 1, speed: 9, energyMax: 1000 }),
                        unit("mid", "Mid", { position: "mid", maxHp: 100, attack: 1, speed: 5, energyMax: 1000 }),
                    ],
                }),
            });
            await fixture.start();

            // 初始行动序列按速度降序：fast(9) → mid(5) → slow(1)
            expect(fixture.battle.state.order).toEqual(["fast", "mid", "slow"]);

            await fixture.dispose();
        });

        test("equal speeds keep a deterministic stable order", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [unit("a", "A", { maxHp: 100, attack: 1, speed: 5, energyMax: 1000 })],
                    enemy: [
                        unit("b", "B", { maxHp: 100, attack: 1, speed: 5, energyMax: 1000 }),
                        unit("c", "C", { maxHp: 100, attack: 1, speed: 5, energyMax: 1000 }),
                    ],
                }),
            });
            await fixture.start();

            // 同速：先己方后敌方、再队内阵列序号，顺序固定可预期
            expect(fixture.battle.state.order).toEqual(["a", "b", "c"]);

            await fixture.dispose();
        });

        test("units that die mid-round are skipped without damage or events", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [
                        unit("a", "A", { position: "front", maxHp: 5, attack: 1, speed: 5, energyMax: 1000 }),
                        unit("b", "B", { position: "mid", maxHp: 100, attack: 1, speed: 3, energyMax: 1000 }),
                    ],
                    enemy: [
                        unit("x", "X", { position: "front", maxHp: 100, attack: 5, speed: 9, energyMax: 1000 }),
                        unit("y", "Y", { position: "mid", maxHp: 100, attack: 1, speed: 4, energyMax: 1000 }),
                    ],
                }),
            });
            await fixture.start();

            fixture.battle.tick(); // x 先手击杀 a（前排）
            expect(fixture.battle.state.units.find((u) => u.id === "a")?.hp).toBe(0);

            const afterKill = fixture.battle.events.length;
            fixture.battle.tick(); // a 本轮已阵亡：行动跳过，不产生伤害或事件
            expect(fixture.battle.events.length).toBe(afterKill);
            expect(fixture.battle.state.units.find((u) => u.id === "a")?.hp).toBe(0);

            await fixture.dispose();
        });

        test("a basic attack deals attack damage and grows energy per the rules", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [unit("a", "A", { position: "front", maxHp: 100, attack: 10, speed: 5, energyMax: 100 })],
                    enemy: [unit("x", "X", { position: "front", maxHp: 100, attack: 1, speed: 4, energyMax: 100 })],
                    energyGainAttacker: 10,
                    energyGainTarget: 5,
                }),
            });
            await fixture.start();

            fixture.battle.tick(); // a 普攻 x
            let a = fixture.battle.state.units.find((u) => u.id === "a");
            let x = fixture.battle.state.units.find((u) => u.id === "x");
            expect(x?.hp).toBe(90);
            expect(a?.energy).toBe(10);
            expect(x?.energy).toBe(5);

            fixture.battle.tick(); // x 普攻 a
            a = fixture.battle.state.units.find((u) => u.id === "a");
            x = fixture.battle.state.units.find((u) => u.id === "x");
            expect(a?.hp).toBe(99);
            expect(a?.energy).toBe(15); // 攻击 10 + 受击 5
            expect(x?.energy).toBe(15); // 受击 5 + 攻击 10

            await fixture.dispose();
        });

        test("a unit with full energy releases a damage skill instead of attacking", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [unit("a", "A", {
                        position: "front",
                        maxHp: 100,
                        attack: 5,
                        speed: 5,
                        energyMax: 50,
                        skill: { id: "a-s", name: "Smash", kind: "damage", value: 30, energyCost: 50 },
                    })],
                    enemy: [unit("x", "X", { position: "front", maxHp: 100, attack: 1, speed: 4, energyMax: 100 })],
                    energyGainAttacker: 50,
                    energyGainTarget: 5,
                }),
            });
            await fixture.start();

            fixture.battle.tick(); // a 普攻 x：能量 0 → 50
            expect(fixture.battle.state.units.find((u) => u.id === "x")?.hp).toBe(95);

            fixture.battle.tick(); // x 普攻 a：a 能量 50+5 → 上限 50
            fixture.battle.tick(); // 第 2 回合 a 满能量 → 释放伤害技能

            const x = fixture.battle.state.units.find((u) => u.id === "x");
            const a = fixture.battle.state.units.find((u) => u.id === "a");
            expect(x?.hp).toBe(65); // 95 - skill 30
            expect(a?.energy).toBe(0);

            const skillEvents = fixture.battle.events.filter(
                (e) => e.type === "skill-damage",
            );
            expect(skillEvents).toHaveLength(1);
            expect(skillEvents[0]?.value).toBe(30);
            expect(skillEvents[0]?.targetId).toBe("x");

            await fixture.dispose();
        });

        test("a unit with full energy releases a heal skill on the lowest-hp ally", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [
                        unit("a", "A", {
                            position: "back",
                            maxHp: 100,
                            attack: 1,
                            speed: 5,
                            energyMax: 50,
                            skill: { id: "a-s", name: "Mend", kind: "heal", value: 3, energyCost: 50 },
                        }),
                        unit("b", "B", { position: "front", maxHp: 10, attack: 1, speed: 3, energyMax: 50 }),
                    ],
                    enemy: [unit("x", "X", { position: "front", maxHp: 100, attack: 5, speed: 4, energyMax: 100 })],
                    energyGainAttacker: 50,
                    energyGainTarget: 5,
                }),
            });
            await fixture.start();

            fixture.battle.tick(); // a 普攻 x：能量 0 → 50
            fixture.battle.tick(); // x 攻击前排 b：b hp 10 → 5
            fixture.battle.tick(); // b 普攻 x
            fixture.battle.tick(); // 第 2 回合 a 满能量 → 治疗 HP 比例最低的存活己方 b

            const b = fixture.battle.state.units.find((u) => u.id === "b");
            const a = fixture.battle.state.units.find((u) => u.id === "a");
            expect(b?.hp).toBe(8); // 5 + heal 3
            expect(a?.energy).toBe(0);

            const healEvents = fixture.battle.events.filter(
                (e) => e.type === "skill-heal",
            );
            expect(healEvents).toHaveLength(1);
            expect(healEvents[0]?.targetId).toBe("b");
            expect(healEvents[0]?.value).toBe(3);

            await fixture.dispose();
        });

        test("target selection prefers the front row and falls back as rows die", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const attacks: string[] = [];
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [unit("a", "A", { position: "front", maxHp: 200, attack: 50, speed: 10, energyMax: 1000 })],
                    enemy: [
                        unit("x", "X", { position: "front", maxHp: 20, attack: 1, speed: 1, energyMax: 1000 }),
                        unit("y", "Y", { position: "mid", maxHp: 100, attack: 1, speed: 1, energyMax: 1000 }),
                        unit("z", "Z", { position: "back", maxHp: 100, attack: 1, speed: 1, energyMax: 1000 }),
                    ],
                }),
                onEvent: (event) => {
                    if (
                        event.type === "attack" &&
                        event.sourceId === "a" &&
                        event.targetId !== undefined
                    ) {
                        attacks.push(event.targetId);
                    }
                },
            });
            await fixture.start();

            let guard = 0;
            while (attacks.length < 4 && guard < 200) {
                fixture.battle.tick();
                guard += 1;
            }

            // 目标顺延：前排 x → 中排 y → 后排 z；x 一次击杀、y 两次击杀
            expect(attacks).toEqual(["x", "y", "y", "z"]);

            await fixture.dispose();
        });

        test("wiping the enemy ends the battle as a win", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [unit("a", "A", { position: "front", maxHp: 100, attack: 20, speed: 10, energyMax: 1000 })],
                    enemy: [unit("x", "X", { position: "front", maxHp: 10, attack: 1, speed: 1, energyMax: 1000 })],
                }),
            });
            await fixture.start();

            fixture.battle.tick(); // a 一击击杀 x

            const state = fixture.battle.state;
            expect(state.phase).toBe("over");
            expect(state.result).toBe("win");

            await fixture.dispose();
        });

        test("losing all allies ends the battle as a loss", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    ally: [unit("a", "A", { position: "front", maxHp: 10, attack: 1, speed: 1, energyMax: 1000 })],
                    enemy: [unit("x", "X", { position: "front", maxHp: 100, attack: 20, speed: 10, energyMax: 1000 })],
                }),
            });
            await fixture.start();

            fixture.battle.tick(); // x 一击击杀 a

            const state = fixture.battle.state;
            expect(state.phase).toBe("over");
            expect(state.result).toBe("lose");

            await fixture.dispose();
        });

        test("tick is a no-op after the battle ends", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    enemy: [unit("x", "X", { maxHp: 10, attack: 1, speed: 1 })],
                }),
            });
            await fixture.start();

            fixture.battle.tick(); // a 一击击杀 x → 终局
            expect(fixture.battle.state.result).toBe("win");

            const before = fixture.battle.events.length;
            const snapshot = fixture.battle.state;
            fixture.battle.tick();
            fixture.battle.tick();

            // 终局后推进不产生事件、状态不变
            expect(fixture.battle.events.length).toBe(before);
            expect(fixture.battle.state).toEqual(snapshot);

            await fixture.dispose();
        });

        test("restart resets the battle to its initial state and is idempotent", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({ configContent: configContent() });
            await fixture.start();

            // 造成伤害并积累能量
            fixture.battle.tick();
            fixture.battle.tick();
            expect(fixture.battle.state.units.some((u) => u.energy > 0)).toBe(true);

            fixture.battle.restart();
            let state = fixture.battle.state;
            expect(state.round).toBe(1);
            expect(state.phase).toBe("fighting");
            expect(state.result).toBeUndefined();
            for (const unit of state.units) {
                expect(unit.hp).toBe(unit.maxHp);
                expect(unit.energy).toBe(0);
            }

            // 幂等：再次重开状态保持一致
            fixture.battle.restart();
            state = fixture.battle.state;
            expect(state.round).toBe(1);
            expect(
                state.units.every((u) => u.hp === u.maxHp && u.energy === 0),
            ).toBe(true);

            await fixture.dispose();
        });

        test("events replay in a deterministic order", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const fixture = createAutoBattleFixture({
                configContent: configContent({
                    enemy: [unit("x", "X", { maxHp: 10, attack: 1, speed: 1 })],
                }),
            });
            await fixture.start();

            fixture.battle.tick(); // a 一击击杀 x → 终局

            const types = fixture.battle.events.map((e) => e.type);
            expect(types).toEqual([
                "round-start",
                "attack",
                "unit-dead",
                "battle-over",
            ]);
            const over = fixture.battle.events[fixture.battle.events.length - 1];
            expect(over?.result).toBe("win");

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
        });

        test("two runs with identical inputs produce identical states", async () => {
            const createAutoBattleFixture = await loadCreateAutoBattleFixture();
            const run = async (): Promise<AutoBattleState> => {
                const fixture = createAutoBattleFixture({
                    configContent: configContent({
                        ally: [
                            unit("a0", "Tank", { position: "front", maxHp: 60, attack: 6, speed: 8, energyMax: 20, skill: { id: "a0-s", name: "Smash", kind: "damage", value: 12, energyCost: 20 } }),
                            unit("a1", "Mage", { position: "mid", maxHp: 45, attack: 9, speed: 7, energyMax: 20, skill: { id: "a1-s", name: "Bolt", kind: "damage", value: 15, energyCost: 20 } }),
                            unit("a2", "Priest", { position: "back", maxHp: 40, attack: 4, speed: 6, energyMax: 20, skill: { id: "a2-s", name: "Mend", kind: "heal", value: 10, energyCost: 20 } }),
                        ],
                        enemy: [
                            unit("e0", "Grunt", { position: "front", maxHp: 60, attack: 6, speed: 8, energyMax: 20, skill: { id: "e0-s", name: "Claw", kind: "damage", value: 12, energyCost: 20 } }),
                            unit("e1", "Raider", { position: "mid", maxHp: 45, attack: 9, speed: 7, energyMax: 20, skill: { id: "e1-s", name: "Swipe", kind: "damage", value: 15, energyCost: 20 } }),
                            unit("e2", "Shaman", { position: "back", maxHp: 40, attack: 4, speed: 6, energyMax: 20, skill: { id: "e2-s", name: "Hex", kind: "damage", value: 8, energyCost: 20 } }),
                        ],
                        energyGainAttacker: 10,
                        energyGainTarget: 5,
                    }),
                });
                await fixture.start();

                let guard = 0;
                while (fixture.battle.state.phase === "fighting" && guard < 1000) {
                    fixture.battle.tick();
                    guard += 1;
                }
                const state = fixture.battle.state;
                await fixture.dispose();
                return state;
            };

            const first = await run();
            const second = await run();

            // 确定性：两次独立运行终局状态逐字段一致，且战斗自然终局
            expect(first).toEqual(second);
            expect(first.result).not.toBeUndefined();

            // 双方单位不重叠 id 且合计 6 单位（3v3 静态槽位）
            const ids = first.units.map((u) => u.id);
            expect(new Set(ids).size).toBe(6);
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
                        offenders.push(path.replace(`${projectRoot}\\`, ""));
                    }
                }
            }
        };

        collect(frameworkRoot);
        expect(offenders).toEqual([]);
    });
});
