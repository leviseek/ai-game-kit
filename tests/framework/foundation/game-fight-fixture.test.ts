import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

import type { GameFixture } from "../../../assets/game/fixture/GameFixture";
import { createResourceProvider } from "../../../assets/framework";
import type { IAudioBackend, EnumAudioGroup, IAudioTrackRef, IResourceProvider, IInputSample, IInputSource, IResourceScope } from "../../../assets/framework";

const projectRoot = resolve(import.meta.dir, "../../..");
const assemblyFile = resolve(projectRoot, "assets/samples/game_fight/assembly.ts");
const assemblyExists = existsSync(assemblyFile);
const frameworkRoot = resolve(projectRoot, "assets/framework");

// ---- 格斗夹具目标契约（task 6.1 锁定，task 6.2 实现） ----

/** 类型化 action：格斗战斗的输入动作，由输入上下文路由产生采样。 */
type FightAction = "punch" | "kick" | "block";

/** 判定盒：招式生效的命中区域，只存在于游戏层（负向边界断言锁定）。 */
interface FightHitbox {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

/** 帧数据：招式各阶段帧数与伤害，由命中帧推导结算，只存在于游戏层。 */
interface FightFrameData {
    readonly id: string;
    readonly name: string;
    readonly startupFrames: number;
    readonly activeFrames: number;
    readonly recoveryFrames: number;
    readonly damage: number;
    readonly hitbox: FightHitbox;
}

/** 战斗状态：帧号、双方血量、连招计数与当前招式。 */
interface FightBattleState {
    readonly frame: number;
    readonly playerHp: number;
    readonly enemyHp: number;
    readonly combo: number;
    readonly activeMoveId: string | null;
}

/** 可控模拟时钟：now() 返回当前模拟时间，只经 advance 推进，与真实时钟无关。 */
interface FightClock {
    now(): number;
    advance(milliseconds: number): void;
}

/**
 * createFightFixture 的注入选项：测试注入受控替身驱动协作行为；
 * 缺省项由夹具内部以引擎无关实现兜底，不强制依赖 cc/fgui。
 */
interface FightFixtureOptions {
    /** 可控模拟时钟：缺省为内建时钟（从 0 开始，测试经 fixture.battle.tick 推进）。 */
    readonly clock?: FightClock;
    /** 底层输入源：注入以推送底层输入事件。 */
    readonly inputSource?: IInputSource;
    /** 音频后端：注入以观察命中播放与作用域停止。 */
    readonly audioBackend?: IAudioBackend;
    /** 资源提供者：注入以观察资源按作用域释放。 */
    readonly provider?: IResourceProvider;
}

/** 夹具暴露的协作钩子：测试驱动固定步长战斗、对象池、输入、资源与音频。 */
interface FightFixtureHooks {
    /** 战斗控制器：固定步长逐帧推进，命中经对象池产生特效并播放音频。 */
    readonly battle: {
        readonly state: FightBattleState;
        tick(): void;
        /** 招式帧数据清单：判定盒/连招/帧数据只存在于游戏层。 */
        readonly moves: readonly FightFrameData[];
    };
    /** 可控模拟时钟：now() 供输入采样与帧推进。 */
    readonly clock: FightClock;
    /** 对象池：特效对象复用而非反复创建。 */
    readonly pool: {
        acquire(): unknown;
        release(item: unknown): void;
        /** 工厂累计创建次数：复用断言依赖。 */
        readonly created: number;
    };
    /** 输入上下文：切换激活上下文并路由类型化 action 采样，联动出招。 */
    readonly input: {
        readonly activeContext: string;
        setActiveContext(context: string): void;
        push(sourceId: string, pressed: boolean, value?: number): void;
        readonly samples: readonly IInputSample<FightAction>[];
    };
    /** 资源作用域：持有战斗资源，dispose 时释放。 */
    readonly resource: {
        readonly scope: IResourceScope | undefined;
        canUnload(bundle: string): boolean;
    };
    /** 音频服务：命中经作用域播放，dispose 时停止。 */
    readonly audio: {
        readonly degraded: boolean;
    };
}

type FightFixture = GameFixture & FightFixtureHooks;
type CreateFightFixture = (options?: FightFixtureOptions) => FightFixture;

async function loadCreateFightFixture(): Promise<CreateFightFixture> {
    const mod = (await import(pathToFileURL(assemblyFile).href)) as { createFightFixture: CreateFightFixture };
    return mod.createFightFixture;
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

// 记录型音频后端：可用性可控，play/stop 调用可断言
class RecordingBackend implements IAudioBackend {
    public readonly available: boolean;
    public readonly playCalls: Array<{ group: EnumAudioGroup; track: IAudioTrackRef }> = [];
    public readonly stopCalls: EnumAudioGroup[] = [];

    constructor(available = true) {
        this.available = available;
    }

    play(group: EnumAudioGroup, track: IAudioTrackRef): void {
        this.playCalls.push({ group, track });
    }

    stop(group: EnumAudioGroup): void {
        this.stopCalls.push(group);
    }

    pause(_group: EnumAudioGroup): void {}

    resume(_group: EnumAudioGroup): void {}

    setVolume(_group: EnumAudioGroup, _volume: number): void {}
}

describe("Fight fixture contract file", () => {
    test("declares createFightFixture without cc or fgui imports", () => {
        expect(existsSync(assemblyFile), "assets/game_fight/assembly.ts not implemented yet (task 6.2)").toBe(true);

        if (!existsSync(assemblyFile)) {
            return;
        }

        const source = readFileSync(assemblyFile, "utf8");

        expect(source).toMatch(/\bexport\s+(?:function|const)\s+createFightFixture\b/);
        // 夹具组合层只经框架根入口与游戏层公共装配入口导入（design decision 3）
        expect(source).not.toMatch(/from\s*["']cc(?:["']|\/)/);
        expect(source).not.toMatch(/from\s*["']fairygui/);
    });
});

describe.skipIf(!assemblyExists)("Fight fixture composition capabilities", () => {
    test("createFightFixture returns a GameFixture exposing the uniform lifecycle", async () => {
        const createFightFixture = await loadCreateFightFixture();
        const fixture = createFightFixture();

        expect(fixture.id).toBe("fight");
        expect(Array.isArray(fixture.modules)).toBe(true);

        for (const seam of ["start", "pause", "resume", "failRollback", "dispose"] as const) {
            expect(typeof fixture[seam]).toBe("function");
        }

        await expect(driveUniformLifecycle(fixture)).resolves.toEqual(["start", "pause", "resume", "dispose"]);
    });

    test("the module list only contains declared capabilities including audio", async () => {
        const createFightFixture = await loadCreateFightFixture();
        const fixture = createFightFixture();

        // 精确断言装配清单：可控时钟、战斗、对象池、输入、资源、音频
        // 六类能力模块；格斗品类声明音频能力（与其他品类负向断言不同）
        expect(fixture.modules.map((m) => m.id)).toEqual(["fight.clock", "fight.battle", "fight.pool", "fight.input", "fight.resource", "fight.audio"]);
    });

    test("a controlled clock drives a deterministic fight under fixed steps", async () => {
        const createFightFixture = await loadCreateFightFixture();

        // 相同输入序列 + 相同帧数运行两次：结果必须完全一致
        const runSequence = async (): Promise<FightBattleState> => {
            const fixture = createFightFixture();
            await fixture.start();

            // 玩家输入出招
            fixture.input.push("keyboard.j", true);
            fixture.input.push("keyboard.j", false);

            // 固定步长逐帧推进：每 tick 一帧，招式经 startup/active/recovery 结算
            for (let index = 0; index < 30; index += 1) {
                fixture.battle.tick();
            }

            const state = fixture.battle.state;
            await fixture.dispose();
            return state;
        };

        const first = await runSequence();
        const second = await runSequence();

        // 确定性：两次独立运行结果逐字段一致
        expect(first).toEqual(second);

        // 输入序列产生确定伤害与连招：punch 命中一次，enemyHp 100-10=90、combo=1
        expect(first.playerHp).toBe(100);
        expect(first.enemyHp).toBe(90);
        expect(first.combo).toBe(1);
        expect(first.frame).toBe(30);
    });

    test("the object pool reuses effects instead of recreating them", async () => {
        const createFightFixture = await loadCreateFightFixture();
        const fixture = createFightFixture();
        await fixture.start();

        // 显式复用：归还后再次借出得到同一对象，工厂不再创建
        const first = fixture.pool.acquire();
        const _second = fixture.pool.acquire();
        fixture.pool.release(first);
        const reused = fixture.pool.acquire();
        expect(reused).toBe(first);
        expect(fixture.pool.created).toBe(2);

        // 战斗命中持续发生：对象池复用而非反复创建（created 保持在小值）
        fixture.input.push("keyboard.j", true);
        fixture.input.push("keyboard.j", false);
        for (let index = 0; index < 40; index += 1) {
            fixture.battle.tick();
        }
        expect(fixture.battle.state.combo).toBeGreaterThan(0);
        expect(fixture.pool.created).toBeLessThanOrEqual(4);

        await fixture.dispose();
    });

    test("repeated hits borrow and return pool objects across full move cycles", async () => {
        const createFightFixture = await loadCreateFightFixture();
        const fixture = createFightFixture();
        await fixture.start();

        const overflowLogs: string[] = [];
        const originalError = console.error;
        console.error = (message?: unknown) => {
            overflowLogs.push(String(message));
        };

        try {
            // 连续 5 次 punch：每次招式 6 帧（startup 1 + active 2 + recovery 3）
            // 结束归还命中特效。若借还成对，created 稳定在容量内且无溢出。
            for (let round = 0; round < 5; round += 1) {
                fixture.input.push("keyboard.j", true);
                fixture.input.push("keyboard.j", false);
                for (let index = 0; index < 6; index += 1) {
                    fixture.battle.tick();
                }
            }

            expect(fixture.battle.state.combo).toBe(5);
            expect(fixture.battle.state.enemyHp).toBe(50);
            // 借还成对：特效对象被复用，工厂创建不随命中线性增长、不溢出
            expect(fixture.pool.created).toBeLessThanOrEqual(4);
            expect(overflowLogs.filter((line) => line.includes("overflow"))).toEqual([]);
        } finally {
            console.error = originalError;
        }

        await fixture.dispose();
    });

    test("resources are held by the fixture scope and released on dispose", async () => {
        const createFightFixture = await loadCreateFightFixture();
        const unloaded: string[] = [];
        const provider = createResourceProvider({
            loader: async (key) => key,
            unloadBundle: (bundle: string) => {
                unloaded.push(bundle);
            },
        });

        const fixture = createFightFixture({ provider });
        await fixture.start();

        expect(fixture.resource.scope).toBeDefined();
        const handle = provider.load("fight", "fx/hit.png");
        fixture.resource.scope?.retain(handle);
        expect(provider.canUnload("fight")).toBe(false);

        await fixture.dispose();

        // 作用域释放后资源可卸载
        expect(unloaded).toContain("fight");
        expect(provider.canUnload("fight")).toBe(true);
    });

    test("audio plays the hit sfx through a scope and stops on dispose", async () => {
        const createFightFixture = await loadCreateFightFixture();
        const backend = new RecordingBackend();

        const fixture = createFightFixture({ audioBackend: backend });
        await fixture.start();

        expect(fixture.audio.degraded).toBe(false);

        // 出招命中触发 sfx 播放
        fixture.input.push("keyboard.j", true);
        fixture.input.push("keyboard.j", false);
        for (let index = 0; index < 30; index += 1) {
            fixture.battle.tick();
        }

        expect(backend.playCalls.some((call) => call.group === "sfx" && call.track.path.includes("hit"))).toBe(true);

        await fixture.dispose();

        // 音频作用域 release 停止命中 sfx
        expect(backend.stopCalls).toContain("sfx");
    });

    test("input routes typed actions and links to the battle move", async () => {
        const createFightFixture = await loadCreateFightFixture();
        const fixture = createFightFixture();
        await fixture.start();

        expect(typeof fixture.input.activeContext).toBe("string");

        const before = fixture.input.samples.length;
        fixture.input.push("keyboard.j", true);
        fixture.input.push("keyboard.j", false);

        // 输入事件被映射为类型化 action 采样
        expect(fixture.input.samples.length).toBe(before + 2);
        const pressed = fixture.input.samples[fixture.input.samples.length - 2];
        expect(pressed.action).toBe("punch");
        expect(pressed.pressed).toBe(true);

        // 输入联动出招：punch 进入活动招式，帧推进后对敌人造成伤害
        for (let index = 0; index < 2; index += 1) {
            fixture.battle.tick();
        }
        expect(fixture.battle.state.activeMoveId).not.toBeNull();
        expect(fixture.battle.state.enemyHp).toBeLessThan(100);

        // 激活上下文可切换，且切换不产生额外采样
        const current = fixture.input.activeContext;
        fixture.input.setActiveContext(current === "gameplay" ? "ui" : "gameplay");
        expect(fixture.input.samples.length).toBe(before + 2);

        await fixture.dispose();
    });

    test("frame data and hitboxes are exposed only from the game layer", async () => {
        const createFightFixture = await loadCreateFightFixture();
        const fixture = createFightFixture();
        await fixture.start();

        // 招式帧数据清单：判定盒/连招/帧数据由夹具暴露，框架层不承载
        expect(fixture.battle.moves.length).toBeGreaterThan(0);
        for (const move of fixture.battle.moves) {
            expect(move.startupFrames).toBeGreaterThanOrEqual(0);
            expect(move.activeFrames).toBeGreaterThan(0);
            expect(move.recoveryFrames).toBeGreaterThanOrEqual(0);
            expect(move.damage).toBeGreaterThan(0);
            expect(move.hitbox).toBeDefined();
            expect(move.hitbox.width).toBeGreaterThan(0);
            expect(move.hitbox.height).toBeGreaterThan(0);
        }

        await fixture.dispose();
    });

    test("failRollback does not disturb the fixture's own capabilities", async () => {
        const createFightFixture = await loadCreateFightFixture();
        const fixture = createFightFixture();
        await fixture.start();

        // 契约保证：探针驱动注定失败的启动并回滚，不改动夹具自身 app 状态
        await fixture.failRollback();

        // 探针后夹具自身能力保持可用
        const before = fixture.input.samples.length;
        fixture.input.push("keyboard.j", true);
        expect(fixture.input.samples.length).toBe(before + 1);

        fixture.battle.tick();
        expect(fixture.battle.state.frame).toBeGreaterThan(0);

        await fixture.dispose();
    });

    test("dispose stops input sampling and releases shared capabilities", async () => {
        const createFightFixture = await loadCreateFightFixture();
        const fixture = createFightFixture();
        await fixture.start();

        const before = fixture.input.samples.length;
        fixture.input.push("keyboard.j", true);
        expect(fixture.input.samples.length).toBe(before + 1);

        await fixture.dispose();

        // 释放后：输入不再路由采样，重复释放幂等
        fixture.input.push("keyboard.j", true);
        expect(fixture.input.samples.length).toBe(before + 1);

        await fixture.dispose();
    });

    test("clock advance rejects negative values", async () => {
        const createFightFixture = await loadCreateFightFixture();
        const fixture = createFightFixture();
        await fixture.start();

        // 时钟只应正向推进：负值推进会破坏帧推进与命中结算的确定性
        expect(() => fixture.clock.advance(-1)).toThrow();

        await fixture.dispose();
    });
});

describe("Fight fixture framework boundary", () => {
    test("the framework layer declares no hitbox/combo/frame-data models", () => {
        // 负向断言：判定盒/连招/帧数据等战斗规则只允许存在于游戏层，框架层不出现
        // 对应类型声明（含裸名与 `Fight` 前缀名，防止业务模型以品类前缀命名侵入框架）。
        // 词表排除 Handle/Play/Scope 等通用前缀（框架有 HandleState/PlayScopeState 等命名），
        // 只保留无歧义的格斗业务词，避免把框架通用概念误判为业务模型。
        const modelPattern = /\b(?:interface|class|type|enum)\s+(?:(?:Fight|Fighter|Battle|Hitbox|Combo|FrameData|Attack|Impact|Strike|Punch|Kick|Round)\w*)\b/;

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
