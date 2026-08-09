import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

import type { GameFixture } from "../../../assets/game/fixture/GameFixture";
import type {
    InputSample,
    InputSource,
    UiNavigator,
} from "../../../assets/framework";

const projectRoot = resolve(import.meta.dir, "../../..");
const assemblyFile = resolve(projectRoot, "assets/game_card/assembly.ts");
const assemblyExists = existsSync(assemblyFile);
const frameworkRoot = resolve(projectRoot, "assets/framework");

// ---- 卡牌夹具目标契约（task 3.1 锁定，task 3.2 实现） ----

/** 卡牌回合阶段：玩家回合、敌方回合、终局。 */
type CardTurnPhase = "player" | "enemy" | "over";

/** 卡牌业务模型：成本与伤害由配置驱动。 */
interface CardConfig {
    readonly id: string;
    readonly name: string;
    readonly cost: number;
    readonly damage: number;
}

interface CardBattleState {
    readonly turn: number;
    readonly phase: CardTurnPhase;
    readonly playerHp: number;
    readonly enemyHp: number;
    readonly mana: number;
    readonly hand: readonly CardConfig[];
}

/** 可控模拟时钟：now() 返回当前模拟时间，只经 advance 推进，与真实时钟无关。 */
interface CardSimClock {
    now(): number;
    advance(milliseconds: number): void;
}

/**
 * createCardFixture 的注入选项：测试注入受控替身驱动协作行为；
 * 缺省项由夹具内部以引擎无关实现兜底，不强制依赖 cc/fgui。
 */
interface CardFixtureOptions {
    /** 可控模拟时钟：缺省为内建时钟（从 0 开始，测试经 fixture.clock.advance 推进）。 */
    readonly clock?: CardSimClock;
    /** 配置内容：驱动卡牌数值与回合时长；缺省为夹具内建缺省配置。 */
    readonly configContent?: Record<string, unknown>;
    /** 底层输入源：注入以推送底层输入事件。 */
    readonly inputSource?: InputSource;
}

/** 夹具暴露的协作钩子：测试驱动可控时间、状态机、配置、输入与 UI。 */
interface CardFixtureHooks {
    /** 回合流状态机：读取 phase 与出牌结果，驱动确定性回合。 */
    readonly battle: {
        readonly state: CardBattleState;
        playCard(index: number): boolean;
        endTurn(): boolean;
    };
    /** 可控模拟时钟：推进回合，结果与真实时钟无关。 */
    readonly clock: CardSimClock;
    /** UI 导航器：route/ViewModel 协作。 */
    readonly navigator: UiNavigator;
    /** 输入上下文：切换激活上下文并路由类型化 action 采样，联动出牌。 */
    readonly input: {
        readonly activeContext: string;
        setActiveContext(context: string): void;
        push(sourceId: string, pressed: boolean, value?: number): void;
        readonly samples: readonly InputSample<string>[];
    };
    /** 配置驱动数值：卡牌与回合时长来自不可变配置表。 */
    readonly config: {
        readonly cards: readonly CardConfig[];
        readonly turnDurationMs: number;
    };
}

type CardFixture = GameFixture & CardFixtureHooks;
type CreateCardFixture = (options?: CardFixtureOptions) => CardFixture;

async function loadCreateCardFixture(): Promise<CreateCardFixture> {
    const mod = (await import(
        pathToFileURL(assemblyFile).href
    )) as { createCardFixture: CreateCardFixture };
    return mod.createCardFixture;
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

describe("Card fixture contract file", () => {
    test("declares createCardFixture without cc or fgui imports", () => {
        expect(
            existsSync(assemblyFile),
            "assets/game_card/assembly.ts not implemented yet (task 3.2)",
        ).toBe(true);

        if (!existsSync(assemblyFile)) {
            return;
        }

        const source = readFileSync(assemblyFile, "utf8");

        expect(source).toMatch(/\bexport\s+(?:function|const)\s+createCardFixture\b/);
        // 夹具组合层只经框架根入口与游戏层公共装配入口导入（design decision 3）
        expect(source).not.toMatch(/from\s*["']cc(?:["']|\/)/);
        expect(source).not.toMatch(/from\s*["']fairygui/);
    });
});

describe.skipIf(!assemblyExists)(
    "Card fixture composition capabilities",
    () => {
        test("createCardFixture returns a GameFixture exposing the uniform lifecycle", async () => {
            const createCardFixture = await loadCreateCardFixture();
            const fixture = createCardFixture();

            expect(fixture.id).toBe("card");
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

        test("the module list only contains declared capabilities and no audio module", async () => {
            const createCardFixture = await loadCreateCardFixture();
            const fixture = createCardFixture();

            // 精确断言装配清单：可控时间、配置、状态机回合流、输入、UI
            // 五类能力模块；未声明能力（音频等）不参与装配
            expect(fixture.modules.map((m) => m.id)).toEqual([
                "card.clock",
                "card.config",
                "card.battle",
                "card.input",
                "card.ui",
            ]);
        });

        test("a controlled clock drives deterministic turns independent of the real clock", async () => {
            const createCardFixture = await loadCreateCardFixture();

            // 相同输入序列运行两次：仅用模拟时钟推进，结果必须完全一致
            const runSequence = async (): Promise<CardBattleState> => {
                const fixture = createCardFixture();
                await fixture.start();

                // 玩家回合：出牌 0（cost 1 / damage 2）与出牌 1（cost 2 / damage 4）
                fixture.input.push("keyboard.1", true);
                fixture.input.push("keyboard.1", false);
                fixture.input.push("keyboard.2", true);
                fixture.input.push("keyboard.2", false);

                // 推进但未超过玩家回合时长：仍处于玩家回合
                fixture.clock.advance(300);

                // 结束玩家回合进入敌方回合
                fixture.input.push("keyboard.enter", true);
                expect(fixture.battle.state.phase).toBe("enemy");

                // 敌方回合经时钟推进超时后回到玩家回合，回合数 +1
                fixture.clock.advance(1500);
                expect(fixture.battle.state.phase).toBe("player");
                expect(fixture.battle.state.turn).toBe(2);

                const state = fixture.battle.state;
                await fixture.dispose();
                return state;
            };

            const first = await runSequence();
            const second = await runSequence();

            // 确定性：两次独立运行结果逐字段一致
            expect(first).toEqual(second);

            // 回合流按输入序列结算：敌方受两卡伤害，回合数推进到 2
            expect(first.turn).toBe(2);
            expect(first.phase).toBe("player");
            expect(first.enemyHp).toBe(2); // 初始 8 - 2 - 4
            expect(first.playerHp).toBe(10);
        });

        test("the state machine expresses the turn flow via phase transitions", async () => {
            const createCardFixture = await loadCreateCardFixture();
            const fixture = createCardFixture();
            await fixture.start();

            expect(fixture.battle.state.phase).toBe("player");

            // 主动结束回合：player → enemy
            expect(fixture.battle.endTurn()).toBe(true);
            expect(fixture.battle.state.phase).toBe("enemy");

            // 敌方阶段经时钟推进超时：enemy → player，回合数 +1
            fixture.clock.advance(1200);
            expect(fixture.battle.state.phase).toBe("player");
            expect(fixture.battle.state.turn).toBe(2);

            // 非玩家阶段出牌被拒绝
            fixture.battle.endTurn();
            expect(fixture.battle.playCard(0)).toBe(false);

            await fixture.dispose();
        });

        test("config drives card numbers and is read from an immutable table", async () => {
            const createCardFixture = await loadCreateCardFixture();
            const configContent = {
                cards: [
                    { id: "sword", name: "Sword", cost: 1, damage: 3 },
                    { id: "flame", name: "Flame", cost: 2, damage: 7 },
                ],
                turnDurationMs: 900,
                playerHp: 20,
                enemyHp: 12,
                startMana: 3,
            };

            const fixture = createCardFixture({ configContent });
            await fixture.start();

            // 配置驱动数值：卡片清单与回合时长来自不可变配置表
            expect(fixture.config.cards).toEqual([
                { id: "sword", name: "Sword", cost: 1, damage: 3 },
                { id: "flame", name: "Flame", cost: 2, damage: 7 },
            ]);
            expect(fixture.config.turnDurationMs).toBe(900);
            expect(fixture.battle.state.playerHp).toBe(20);
            expect(fixture.battle.state.enemyHp).toBe(12);

            // 出牌结算按配置数值扣除：damage 3 → enemyHp 9
            expect(fixture.battle.playCard(0)).toBe(true);
            expect(fixture.battle.state.enemyHp).toBe(9);

            await fixture.dispose();
        });

        test("input routes typed actions and plays cards through the UI-linked flow", async () => {
            const createCardFixture = await loadCreateCardFixture();
            const fixture = createCardFixture();
            await fixture.start();

            expect(typeof fixture.input.activeContext).toBe("string");

            const before = fixture.input.samples.length;
            fixture.input.push("keyboard.1", true);
            fixture.input.push("keyboard.1", false);

            // 输入事件被映射为类型化 action 采样
            expect(fixture.input.samples.length).toBe(before + 2);
            const pressed = fixture.input.samples[fixture.input.samples.length - 2];
            expect(pressed.action).toBe("play-card-0");
            expect(pressed.pressed).toBe(true);

            // 输入联动出牌：按下 keyboard.1 后卡牌 0 结算生效
            expect(fixture.battle.state.enemyHp).toBe(6); // 初始 8 - damage 2

            // 激活上下文可切换，且切换不产生额外采样
            const current = fixture.input.activeContext;
            fixture.input.setActiveContext(current === "gameplay" ? "ui" : "gameplay");
            expect(fixture.input.samples.length).toBe(before + 2);

            await fixture.dispose();
        });

        test("UI navigation opens and closes the battle route through the navigator", async () => {
            const createCardFixture = await loadCreateCardFixture();
            const fixture = createCardFixture();
            await fixture.start();

            const opened = fixture.navigator.open("card/battle");
            expect(opened.ok).toBe(true);
            expect(fixture.navigator.top?.route).toBe("card/battle");

            const closed = fixture.navigator.close();
            expect(closed.ok).toBe(true);
            expect(fixture.navigator.top).toBeUndefined();

            await fixture.dispose();
        });

        test("failRollback does not disturb the fixture's own capabilities", async () => {
            const createCardFixture = await loadCreateCardFixture();
            const fixture = createCardFixture();
            await fixture.start();

            // 契约保证：探针驱动注定失败的启动并回滚，不改动夹具自身 app 状态
            await fixture.failRollback();

            // 探针后夹具自身能力保持可用
            const opened = fixture.navigator.open("card/battle");
            expect(opened.ok).toBe(true);

            expect(fixture.battle.playCard(0)).toBe(true);

            const before = fixture.input.samples.length;
            fixture.input.push("keyboard.1", true);
            expect(fixture.input.samples.length).toBe(before + 1);

            await fixture.dispose();
        });

        test("dispose stops input sampling and releases shared capabilities", async () => {
            const createCardFixture = await loadCreateCardFixture();
            const fixture = createCardFixture();
            await fixture.start();

            const before = fixture.input.samples.length;
            fixture.input.push("keyboard.1", true);
            expect(fixture.input.samples.length).toBe(before + 1);

            await fixture.dispose();

            // 释放后：输入不再路由采样、导航拒绝新请求，重复释放幂等
            fixture.input.push("keyboard.1", true);
            expect(fixture.input.samples.length).toBe(before + 1);

            expect(fixture.navigator.open("card/battle").ok).toBe(false);
            expect(fixture.battle.playCard(0)).toBe(false);

            await fixture.dispose();
        });

        test("playCard rejects when mana is insufficient and battle state is unchanged", async () => {
            const createCardFixture = await loadCreateCardFixture();
            const fixture = createCardFixture();
            await fixture.start();

            // 默认配置 startMana 3：card-0 cost 1 / card-1 cost 2
            expect(fixture.battle.playCard(0)).toBe(true); // mana 3 -> 2
            expect(fixture.battle.playCard(1)).toBe(true); // mana 2 -> 0

            const before = fixture.battle.state;
            // mana 已耗尽：出牌被拒绝且状态不变
            expect(fixture.battle.playCard(1)).toBe(false);
            expect(fixture.battle.state.mana).toBe(before.mana);
            expect(fixture.battle.state.enemyHp).toBe(before.enemyHp);

            await fixture.dispose();
        });

        test("a finishing blow ends the battle in the over phase and blocks further actions", async () => {
            const createCardFixture = await loadCreateCardFixture();
            // 敌方 hp 4，两卡各 cost 1 / damage 3：两击后敌 hp 归零进入终局
            const fixture = createCardFixture({
                configContent: {
                    cards: [
                        { id: "strike", name: "Strike", cost: 1, damage: 3 },
                        { id: "swipe", name: "Swipe", cost: 1, damage: 3 },
                    ],
                    turnDurationMs: 1000,
                    playerHp: 10,
                    enemyHp: 4,
                    startMana: 2,
                },
            });
            await fixture.start();

            expect(fixture.battle.playCard(0)).toBe(true); // enemyHp 4 -> 1
            expect(fixture.battle.playCard(1)).toBe(true); // enemyHp 1 -> 0, finish
            expect(fixture.battle.state.phase).toBe("over");
            expect(fixture.battle.state.enemyHp).toBe(0);

            // 终局后出牌与结束回合均被拒绝
            expect(fixture.battle.playCard(0)).toBe(false);
            expect(fixture.battle.endTurn()).toBe(false);

            await fixture.dispose();
        });

        test("mana resets to the configured start mana when a new turn begins", async () => {
            const createCardFixture = await loadCreateCardFixture();
            const fixture = createCardFixture();
            await fixture.start();

            expect(fixture.battle.playCard(0)).toBe(true); // mana 3 -> 2
            fixture.battle.endTurn(); // -> enemy
            fixture.clock.advance(1500); // 超时回 player，turn 2

            expect(fixture.battle.state.turn).toBe(2);
            expect(fixture.battle.state.mana).toBe(3); // 重置为 startMana

            await fixture.dispose();
        });

        test("clock advance rejects negative values", async () => {
            const createCardFixture = await loadCreateCardFixture();
            const fixture = createCardFixture();
            await fixture.start();

            // 时钟只应正向推进：负值推进会破坏超时判定与回合确定性
            expect(() => fixture.clock.advance(-1)).toThrow();

            await fixture.dispose();
        });

        test("config rejects malformed card numbers at construction time", async () => {
            const createCardFixture = await loadCreateCardFixture();

            const malformed = [
                { id: "a", name: "A", cost: Number.NaN, damage: 1 },
                { id: "a", name: "A", cost: 1, damage: Number.POSITIVE_INFINITY },
                { id: "a", name: "A", cost: -1, damage: 1 },
                { id: "a", name: "A", cost: 1, damage: -1 },
            ];

            for (const cards of malformed) {
                expect(
                    () =>
                        createCardFixture({
                            configContent: {
                                cards: [cards],
                                turnDurationMs: 1000,
                                playerHp: 10,
                                enemyHp: 8,
                                startMana: 3,
                            },
                        }),
                ).toThrow();
            }
        });

        test("enemy phase times out exactly at the configured turn duration", async () => {
            const createCardFixture = await loadCreateCardFixture();
            const fixture = createCardFixture();
            await fixture.start();

            fixture.battle.endTurn(); // -> enemy，phaseEnteredAt = 0
            fixture.clock.advance(1000); // 恰等于 turnDurationMs

            // 边界语义：达到时长即超时（>=），返回 player 且回合数 +1
            expect(fixture.battle.state.phase).toBe("player");
            expect(fixture.battle.state.turn).toBe(2);

            await fixture.dispose();
        });
    },
);

describe("Card fixture framework boundary", () => {
    test("the framework layer declares no card deck or turn rule models", () => {
        // 负向断言：卡组/回合/效果结算等业务模型只允许存在于游戏层，框架层不出现
        // 对应类型声明（含裸名与 `Card` 前缀名，防止业务模型以品类前缀命名侵入框架）。
        // 词表排除 Hand/Play 等通用前缀（框架有 HandleState/PlayScopeState 等命名），
        // 只保留无歧义的卡牌业务词，避免把框架通用概念误判为业务模型
        const modelPattern =
            /\b(?:interface|class|type|enum)\s+(?:(?:Card|Deck|Turn|Mana|Cost|Effect|Round)\w*)\b/;

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
