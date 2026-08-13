import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

import type { GameFixture } from "../../../assets/game/fixture/GameFixture";
import type { PlatformStorage, TimeSource } from "../../../assets/framework";
import { MemoryPlatform } from "../../../assets/framework/adapters/memory/MemoryPlatform";

const projectRoot = resolve(import.meta.dir, "../../..");
const assemblyFile = resolve(projectRoot, "assets/samples/game_idle/assembly.ts");
const assemblyExists = existsSync(assemblyFile);
const frameworkRoot = resolve(projectRoot, "assets/framework");

// ---- 挂机夹具目标契约（task 4.1 锁定，task 4.2 实现） ----

/** 成长进度状态：等级与金币；离线收益结算后经存档持久化。 */
interface IdleProgressState {
    readonly level: number;
    readonly gold: number;
    /** 上次在线/离线结算的墙钟时间戳（毫秒）。 */
    readonly lastSettledAtMs: number;
}

/** 可控墙钟：now() 返回当前墙钟时间，只经 advance 推进，模拟离线时长。 */
interface IdleClock extends TimeSource {
    advance(milliseconds: number): void;
}

/**
 * createIdleFixture 的注入选项：测试注入受控替身驱动协作行为；
 * 缺省项由夹具内部以引擎无关实现兜底，不强制依赖 cc/fgui。
 */
interface IdleFixtureOptions {
    /** 可控墙钟：缺省为内建时钟（从 0 开始，测试经 fixture.clock.advance 推进）。 */
    readonly clock?: IdleClock;
    /** 平台存储后端：缺省为内存存储；观察版本化存档写入/读取。 */
    readonly storage?: PlatformStorage;
}

/** 夹具暴露的协作钩子：测试驱动墙钟、调度、成长进度与版本化存档。 */
interface IdleFixtureHooks {
    /** 成长进度：等级与金币；离线收益结算后写存档。 */
    readonly progress: {
        readonly state: IdleProgressState;
        readonly level: number;
        readonly gold: number;
        /** 升级接缝：等级提升放大离线收益（成长公式在游戏层）。 */
        advanceLevel(): void;
    };
    /** 可控墙钟：推进模拟离线时长，驱动离线收益结算。 */
    readonly clock: IdleClock;
    /** 被动调度器：tick 推进在线收益任务。 */
    readonly scheduler: {
        tick(): void;
    };
    /** 版本化存档仓库：离线收益持久化后可版本化往返。 */
    readonly storage: {
        readonly currentVersion: number;
        save(namespace: string, key: string, data: unknown): Promise<void>;
        load(namespace: string, key: string): Promise<{ version: number; data: unknown } | null>;
    };
}

type IdleFixture = GameFixture & IdleFixtureHooks;
type CreateIdleFixture = (options?: IdleFixtureOptions) => IdleFixture;

async function loadCreateIdleFixture(): Promise<CreateIdleFixture> {
    const mod = (await import(pathToFileURL(assemblyFile).href)) as { createIdleFixture: CreateIdleFixture };
    return mod.createIdleFixture;
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

describe("Idle fixture contract file", () => {
    test("declares createIdleFixture without cc or fgui imports", () => {
        expect(existsSync(assemblyFile), "assets/game_idle/assembly.ts not implemented yet (task 4.2)").toBe(true);

        if (!existsSync(assemblyFile)) {
            return;
        }

        const source = readFileSync(assemblyFile, "utf8");

        expect(source).toMatch(/\bexport\s+(?:function|const)\s+createIdleFixture\b/);
        // 夹具组合层只经框架根入口与游戏层公共装配入口导入（design decision 3）
        expect(source).not.toMatch(/from\s*["']cc(?:["']|\/)/);
        expect(source).not.toMatch(/from\s*["']fairygui/);
    });
});

describe.skipIf(!assemblyExists)("Idle fixture composition capabilities", () => {
    test("createIdleFixture returns a GameFixture exposing the uniform lifecycle", async () => {
        const createIdleFixture = await loadCreateIdleFixture();
        const fixture = createIdleFixture();

        expect(fixture.id).toBe("idle");
        expect(Array.isArray(fixture.modules)).toBe(true);

        for (const seam of ["start", "pause", "resume", "failRollback", "dispose"] as const) {
            expect(typeof fixture[seam]).toBe("function");
        }

        await expect(driveUniformLifecycle(fixture)).resolves.toEqual(["start", "pause", "resume", "dispose"]);
    });

    test("the module list only contains declared capabilities and no audio module", async () => {
        const createIdleFixture = await loadCreateIdleFixture();
        const fixture = createIdleFixture();

        // 精确断言装配清单：墙钟、调度、成长进度、版本化存档
        // 四类能力模块；未声明能力（音频/UI/输入等）不参与装配
        expect(fixture.modules.map((m) => m.id)).toEqual(["idle.clock", "idle.scheduler", "idle.progress", "idle.save"]);
    });

    test("offline earnings settle on resume after a wall-clock pause and persist to the save", async () => {
        const createIdleFixture = await loadCreateIdleFixture();
        const storage = new MemoryPlatform();
        const fixture = createIdleFixture({ storage });
        await fixture.start();

        const before = fixture.progress.gold;

        // 暂停（模拟离线）：记录离线起点
        await fixture.pause();

        // 离线 1 小时：只经墙钟推进，不产生其他结算
        fixture.clock.advance(3_600_000);

        // 恢复：按墙钟累计的离线时长结算离线收益并持久化
        await fixture.resume();

        expect(fixture.progress.gold).toBeGreaterThan(before);

        // 离线收益已写入版本化存档：可版本化往返且数据一致
        const saved = await fixture.storage.load("idle", "progress");
        expect(saved).not.toBeNull();
        expect(saved?.version).toBe(fixture.storage.currentVersion);
        expect(saved?.data).toEqual({
            level: fixture.progress.level,
            gold: fixture.progress.gold,
        });

        await fixture.dispose();
    });

    test("the scheduler drives online earnings forward on tick", async () => {
        const createIdleFixture = await loadCreateIdleFixture();
        const fixture = createIdleFixture();
        await fixture.start();

        const before = fixture.progress.gold;

        // 在线收益经被动调度器推进：tick 不改变墙钟，仅结算已到期的在线任务
        fixture.clock.advance(1000);
        fixture.scheduler.tick();

        expect(fixture.progress.gold).toBeGreaterThan(before);

        // 墙钟未推进时 tick 不产生新的在线收益
        const steady = fixture.progress.gold;
        fixture.scheduler.tick();
        expect(fixture.progress.gold).toBe(steady);

        await fixture.dispose();
    });

    test("offline earnings scale with the growth level (formula lives in the game layer)", async () => {
        const createIdleFixture = await loadCreateIdleFixture();
        const fixture = createIdleFixture();
        await fixture.start();

        const settle = async (): Promise<number> => {
            await fixture.pause();
            fixture.clock.advance(60_000); // 离线 1 分钟
            const before = fixture.progress.gold;
            await fixture.resume();
            return fixture.progress.gold - before;
        };

        // 等级 1 的离线收益
        const earningsAtLevel1 = await settle();

        // 升级后离线收益放大（成长公式使等级放大收益）
        fixture.progress.advanceLevel();
        const earningsAtLevel2 = await settle();

        expect(earningsAtLevel2).toBeGreaterThan(earningsAtLevel1);
        expect(fixture.progress.level).toBe(2);

        await fixture.dispose();
    });

    test("versioned save round-trips the progress state", async () => {
        const createIdleFixture = await loadCreateIdleFixture();
        const storage = new MemoryPlatform();
        const fixture = createIdleFixture({ storage });
        await fixture.start();

        await fixture.storage.save("idle", "progress", {
            level: 3,
            gold: 250,
        });

        const loaded = await fixture.storage.load("idle", "progress");
        expect(loaded).not.toBeNull();
        expect(loaded?.data).toEqual({ level: 3, gold: 250 });
        expect(loaded?.version).toBe(fixture.storage.currentVersion);
        expect(fixture.storage.currentVersion).toBeGreaterThanOrEqual(1);

        await fixture.dispose();
    });

    test("failRollback does not disturb the fixture's own capabilities", async () => {
        const createIdleFixture = await loadCreateIdleFixture();
        const fixture = createIdleFixture();
        await fixture.start();

        // 契约保证：探针驱动注定失败的启动并回滚，不改动夹具自身 app 状态
        await fixture.failRollback();

        // 探针后夹具自身能力保持可用
        const before = fixture.progress.gold;
        await fixture.pause();
        fixture.clock.advance(60_000);
        await fixture.resume();
        expect(fixture.progress.gold).toBeGreaterThan(before);

        fixture.scheduler.tick();
        expect(fixture.progress.gold).toBeGreaterThanOrEqual(before);

        await fixture.dispose();
    });

    test("dispose stops scheduling and releases shared capabilities", async () => {
        const createIdleFixture = await loadCreateIdleFixture();
        const fixture = createIdleFixture();
        await fixture.start();

        fixture.clock.advance(1000);
        fixture.scheduler.tick();
        const before = fixture.progress.gold;
        expect(before).toBeGreaterThan(0);

        await fixture.dispose();

        // 释放后：调度不再推进在线收益，重复释放幂等
        fixture.clock.advance(1000);
        fixture.scheduler.tick();
        expect(fixture.progress.gold).toBe(before);

        await fixture.dispose();
    });

    test("wall clock advance without pause does not settle offline earnings", async () => {
        const createIdleFixture = await loadCreateIdleFixture();
        const fixture = createIdleFixture();
        await fixture.start();

        const before = fixture.progress.gold;

        // 未暂停直接推进墙钟：不触发离线结算（只有暂停→恢复衔接才结算）
        fixture.clock.advance(3_600_000);
        fixture.scheduler.tick();

        // 墙钟推进本身不结算离线收益；仅调度到期任务结算在线收益
        expect(fixture.progress.gold).toBe(before);

        await fixture.dispose();
    });

    test("online earnings survive small clock jitter beyond one tick interval", async () => {
        // 回归防护（ai-sensei 审查 S1）：调度时机与 tick 间隔不严格对齐时
        // 在线收益不应被误杀。推进 1.5 倍间隔后 tick 应照常结算在线收益。
        const createIdleFixture = await loadCreateIdleFixture();
        const fixture = createIdleFixture();
        await fixture.start();

        const before = fixture.progress.gold;
        fixture.clock.advance(1500);
        fixture.scheduler.tick();

        expect(fixture.progress.gold).toBeGreaterThan(before);

        await fixture.dispose();
    });

    test("a large wall-clock jump (offline-style) still skips online earnings", async () => {
        // 与上一条对照：超过跳变阈值（如暂停恢复后的第一拍、异常长推进）才跳过
        // 在线收益；正常抖动与离线级跳变由不同阈值区分。
        const createIdleFixture = await loadCreateIdleFixture();
        const fixture = createIdleFixture();
        await fixture.start();

        const before = fixture.progress.gold;
        fixture.clock.advance(60_000);
        fixture.scheduler.tick();

        expect(fixture.progress.gold).toBe(before);

        await fixture.dispose();
    });

    test("repeated pause does not lose accumulated offline time", async () => {
        // 回归防护（ai-sensei 审查 S2）：Application.pause 对已暂停状态幂等 resolve，
        // 暂停中再次 pause 是合法输入；第二次 pause 不得重置离线起点。
        const createIdleFixture = await loadCreateIdleFixture();
        const fixture = createIdleFixture();
        await fixture.start();

        await fixture.pause();
        fixture.clock.advance(60_000); // 离线 1 分钟
        await fixture.pause(); // 重复暂停：不得重置起点
        fixture.clock.advance(60_000); // 再离线 1 分钟
        const before = fixture.progress.gold;
        await fixture.resume();

        // 累计离线 2 分钟应结算 2 分钟收益（等级 1 → 2 金币）
        expect(fixture.progress.gold - before).toBe(2);

        await fixture.dispose();
    });

    test("repeated resume settles offline earnings only once", async () => {
        // 回归防护（ai-sensei 审查 M4）：离线起点在首次结算时消费，
        // 后续 resume 只结算 0 时长，不重复累计。
        const createIdleFixture = await loadCreateIdleFixture();
        const fixture = createIdleFixture();
        await fixture.start();

        await fixture.pause();
        fixture.clock.advance(60_000);
        await fixture.resume();

        const afterFirst = fixture.progress.gold;

        // 未暂停直接 resume：base.resume 幂等，settleOfflineAndSave 只结算 0 时长
        await fixture.resume();
        expect(fixture.progress.gold).toBe(afterFirst);

        await fixture.dispose();
    });

    test("a failing save does not corrupt in-memory gold and a later resume rewrites the save", async () => {
        // 回归防护（ai-sensei 审查 M2/M4）：存档写入失败时 resume reject，
        // 但金币已在内存结算、离线起点已消费；后续成功 resume 重写存档补齐，
        // 不产生重复累计。
        let failWrites = true;
        const failingStorage: PlatformStorage = {
            async get(_key: string): Promise<string | null> {
                return null;
            },
            async set(): Promise<void> {
                if (failWrites) {
                    throw new Error("storage write failed");
                }
            },
            async delete(): Promise<void> {},
        };

        const createIdleFixture = await loadCreateIdleFixture();
        const fixture = createIdleFixture({ storage: failingStorage });
        await fixture.start();

        await fixture.pause();
        fixture.clock.advance(60_000);

        // 首次 resume：存档写失败 → reject，但内存金币已结算
        await expect(fixture.resume()).rejects.toThrow();
        expect(fixture.progress.gold).toBeGreaterThan(0);

        // 恢复写入后再次 resume：重写存档补齐，金币不重复累计
        failWrites = false;
        await fixture.resume();
        expect(fixture.progress.gold).toBeGreaterThan(0);

        await fixture.dispose();
    });
});

describe("Idle fixture framework boundary", () => {
    test("the framework layer declares no offline earnings or growth models", () => {
        // 负向断言：离线收益/成长公式等业务模型只允许存在于游戏层，框架层不出现
        // 对应类型声明（含裸名与 `Idle` 前缀名，防止业务模型以品类前缀命名侵入框架）
        const modelPattern = /\b(?:interface|class|type|enum)\s+(?:(?:Idle|Offline|Earn|Growth|Income|Clicker|Gold)\w*)\b/;

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
