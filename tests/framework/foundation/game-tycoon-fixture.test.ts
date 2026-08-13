import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

import type { GameFixture } from "../../../assets/game/fixture/GameFixture";
import type { PlatformStorage, TimeSource, UiNavigator } from "../../../assets/framework";
import { MemoryPlatform } from "../../../assets/framework/adapters/memory/MemoryPlatform";

const projectRoot = resolve(import.meta.dir, "../../..");
const assemblyFile = resolve(projectRoot, "assets/samples/game_tycoon/assembly.ts");
const assemblyExists = existsSync(assemblyFile);
const frameworkRoot = resolve(projectRoot, "assets/framework");

// ---- 经营夹具目标契约（task 5.1 锁定，task 5.2 实现） ----

/** 生产产品配置：成本、售价与生产时长由配置表驱动（数值与来源分离）。 */
interface TycoonProduct {
    readonly id: string;
    readonly name: string;
    readonly cost: number;
    readonly price: number;
    readonly durationMs: number;
}

/** 生产链状态：当前生产中的产品与完成进度（0..1），空闲时无活动任务。 */
interface TycoonProductionState {
    readonly activeProductId: string | null;
    readonly progress: number;
}

/** 经济状态：现金与各产品库存；生产完成入库存、出售换现金。 */
interface TycoonEconomicState {
    readonly cash: number;
    readonly inventory: Readonly<Record<string, number>>;
}

/** 可控模拟时钟：now() 返回当前模拟时间，只经 advance 推进，与真实时钟无关。 */
interface TycoonClock extends TimeSource {
    advance(milliseconds: number): void;
}

/**
 * createTycoonFixture 的注入选项：测试注入受控替身驱动协作行为；
 * 缺省项由夹具内部以引擎无关实现兜底，不强制依赖 cc/fgui。
 */
interface TycoonFixtureOptions {
    /** 可控模拟时钟：缺省为内建时钟（从 0 开始，测试经 fixture.clock.advance 推进）。 */
    readonly clock?: TycoonClock;
    /** 配置内容：驱动产品数值与初始现金；缺省为夹具内建缺省配置。 */
    readonly configContent?: Record<string, unknown>;
    /** 平台存储后端：缺省为内存存储；观察版本化存档写入/读取。 */
    readonly storage?: PlatformStorage;
}

/** 夹具暴露的协作钩子：测试驱动调度、生产、经济、配置、存档与分层 UI。 */
interface TycoonFixtureHooks {
    /** 生产链控制器：读取进度，驱动生产任务推进。 */
    readonly production: {
        readonly state: TycoonProductionState;
        /** 开始生产一个产品：需现金足够且产线空闲；返回是否已开始。 */
        start(productId: string): boolean;
    };
    /** 经济控制器：现金与库存；出售库存换现金。 */
    readonly economy: {
        readonly state: TycoonEconomicState;
        readonly cash: number;
        readonly inventory: Readonly<Record<string, number>>;
        /** 出售库存中指定产品，换取售价现金；库存不足拒绝。 */
        sell(productId: string): boolean;
    };
    /** 被动调度器：tick 推进生产任务。 */
    readonly scheduler: {
        tick(): void;
    };
    /** 可控模拟时钟：推进生产时长，驱动任务完成。 */
    readonly clock: TycoonClock;
    /** 版本化存档仓库：经营状态持久化后可版本化往返。 */
    readonly storage: {
        readonly currentVersion: number;
        save(namespace: string, key: string, data: unknown): Promise<void>;
        load(namespace: string, key: string): Promise<{ version: number; data: unknown } | null>;
    };
    /** 配置驱动数值：产品清单与初始现金来自不可变配置表。 */
    readonly config: {
        readonly products: readonly TycoonProduct[];
        readonly startCash: number;
    };
    /** UI 导航器：分层 UI 经不同层级 route 呈现经营状态。 */
    readonly navigator: UiNavigator;
    /** 分层 UI 呈现钩子：经 live 状态派生各层 ViewModel，供导航 route 消费。 */
    readonly ui: {
        /** normal 层总览：现金与库存快照。 */
        readonly hubViewModel: {
            readonly cash: number;
            readonly inventory: Readonly<Record<string, number>>;
        };
        /** popup 层生产详情：当前生产任务与进度。 */
        readonly factoryViewModel: {
            readonly activeProductId: string | null;
            readonly progress: number;
        };
    };
}

type TycoonFixture = GameFixture & TycoonFixtureHooks;
type CreateTycoonFixture = (options?: TycoonFixtureOptions) => TycoonFixture;

async function loadCreateTycoonFixture(): Promise<CreateTycoonFixture> {
    const mod = (await import(pathToFileURL(assemblyFile).href)) as { createTycoonFixture: CreateTycoonFixture };
    return mod.createTycoonFixture;
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

describe("Tycoon fixture contract file", () => {
    test("declares createTycoonFixture without cc or fgui imports", () => {
        expect(existsSync(assemblyFile), "assets/game_tycoon/assembly.ts not implemented yet (task 5.2)").toBe(true);

        if (!existsSync(assemblyFile)) {
            return;
        }

        const source = readFileSync(assemblyFile, "utf8");

        expect(source).toMatch(/\bexport\s+(?:function|const)\s+createTycoonFixture\b/);
        // 夹具组合层只经框架根入口与游戏层公共装配入口导入（design decision 3）
        expect(source).not.toMatch(/from\s*["']cc(?:["']|\/)/);
        expect(source).not.toMatch(/from\s*["']fairygui/);
    });
});

describe.skipIf(!assemblyExists)("Tycoon fixture composition capabilities", () => {
    test("createTycoonFixture returns a GameFixture exposing the uniform lifecycle", async () => {
        const createTycoonFixture = await loadCreateTycoonFixture();
        const fixture = createTycoonFixture();

        expect(fixture.id).toBe("tycoon");
        expect(Array.isArray(fixture.modules)).toBe(true);

        for (const seam of ["start", "pause", "resume", "failRollback", "dispose"] as const) {
            expect(typeof fixture[seam]).toBe("function");
        }

        await expect(driveUniformLifecycle(fixture)).resolves.toEqual(["start", "pause", "resume", "dispose"]);
    });

    test("the module list only contains declared capabilities and no audio module", async () => {
        const createTycoonFixture = await loadCreateTycoonFixture();
        const fixture = createTycoonFixture();

        // 精确断言装配清单：可控时间、调度、配置、生产、经济、存档、分层 UI
        // 七类能力模块；未声明能力（音频等）不参与装配
        expect(fixture.modules.map((m) => m.id)).toEqual(["tycoon.clock", "tycoon.scheduler", "tycoon.config", "tycoon.production", "tycoon.economy", "tycoon.save", "tycoon.ui"]);
    });

    test("production advances through the scheduler and settles the economy", async () => {
        const createTycoonFixture = await loadCreateTycoonFixture();
        const fixture = createTycoonFixture();
        await fixture.start();

        // 开始生产 widget：默认配置 cost 5，初始现金 100
        expect(fixture.production.start("widget")).toBe(true);
        expect(fixture.economy.cash).toBe(95);
        expect(fixture.production.state.activeProductId).toBe("widget");

        // 推进生产时长（widget durationMs 1000）后 tick：任务完成
        fixture.clock.advance(1000);
        fixture.scheduler.tick();

        // 生产完成：产品入库存，产线回到空闲
        expect(fixture.production.state.activeProductId).toBeNull();
        expect(fixture.production.state.progress).toBe(0);
        expect(fixture.economy.inventory["widget"]).toBe(1);

        await fixture.dispose();
    });

    test("the scheduler drives production in fixed steps without a real timer", async () => {
        const createTycoonFixture = await loadCreateTycoonFixture();
        const fixture = createTycoonFixture();
        await fixture.start();

        fixture.production.start("gadget"); // durationMs 2000

        // 推进一半时长：进度按配置时长推进，未完成
        fixture.clock.advance(1000);
        fixture.scheduler.tick();
        expect(fixture.production.state.progress).toBe(0.5);

        // 未推进时钟时 tick 不额外推进
        const steady = fixture.production.state.progress;
        fixture.scheduler.tick();
        expect(fixture.production.state.progress).toBe(steady);

        // 再推进剩余时长：完成入库存
        fixture.clock.advance(1000);
        fixture.scheduler.tick();
        expect(fixture.production.state.activeProductId).toBeNull();
        expect(fixture.economy.inventory["gadget"]).toBe(1);

        await fixture.dispose();
    });

    test("config drives product numbers and is read from an immutable table", async () => {
        const createTycoonFixture = await loadCreateTycoonFixture();
        const configContent = {
            startCash: 200,
            products: [
                { id: "bread", name: "Bread", cost: 2, price: 5, durationMs: 500 },
                { id: "cake", name: "Cake", cost: 6, price: 12, durationMs: 1500 },
            ],
        };

        const fixture = createTycoonFixture({ configContent });
        await fixture.start();

        // 配置驱动数值：产品清单与初始现金来自不可变配置表
        expect(fixture.config.products).toEqual([
            { id: "bread", name: "Bread", cost: 2, price: 5, durationMs: 500 },
            { id: "cake", name: "Cake", cost: 6, price: 12, durationMs: 1500 },
        ]);
        expect(fixture.config.startCash).toBe(200);
        expect(fixture.economy.cash).toBe(200);

        // 生产时长按配置结算：首次 tick（1000ms 节拍）时 bread（500ms）已完成、
        // cake（1500ms）未完成，证明时长由配置驱动而非固定
        expect(fixture.production.start("bread")).toBe(true);
        fixture.clock.advance(1000);
        fixture.scheduler.tick();
        expect(fixture.economy.inventory["bread"]).toBe(1);

        expect(fixture.production.start("cake")).toBe(true);
        fixture.clock.advance(1000);
        fixture.scheduler.tick();
        expect(fixture.economy.inventory["cake"]).toBeUndefined();
        expect(fixture.production.state.activeProductId).toBe("cake");

        await fixture.dispose();
    });

    test("the economy model sells inventory for cash and rejects empty stock", async () => {
        const createTycoonFixture = await loadCreateTycoonFixture();
        const fixture = createTycoonFixture();
        await fixture.start();

        // 出售空库存被拒绝，现金不变
        expect(fixture.economy.sell("widget")).toBe(false);

        // 生产一件 widget 后出售：成本扣减、售价入账
        fixture.production.start("widget"); // cost 5
        const cashAfterProduction = fixture.economy.cash; // 100 - 5 = 95
        fixture.clock.advance(1000);
        fixture.scheduler.tick();
        expect(fixture.economy.inventory["widget"]).toBe(1);

        expect(fixture.economy.sell("widget")).toBe(true);
        expect(fixture.economy.inventory["widget"]).toBe(0);
        // 出售按配置售价入账：生产后现金 + price 10
        expect(fixture.economy.cash).toBe(cashAfterProduction + 10);

        await fixture.dispose();
    });

    test("versioned save round-trips the economy state consistently", async () => {
        const createTycoonFixture = await loadCreateTycoonFixture();
        const storage = new MemoryPlatform();
        const fixture = createTycoonFixture({ storage });
        await fixture.start();

        // 生产结算后的经济状态与存档一致：先生产再存
        fixture.production.start("widget");
        fixture.clock.advance(1000);
        fixture.scheduler.tick();

        const state = fixture.economy.state;
        await fixture.storage.save("tycoon", "economy", state);

        const loaded = await fixture.storage.load("tycoon", "economy");
        expect(loaded).not.toBeNull();
        expect(loaded?.data).toEqual(state);
        expect(loaded?.version).toBe(fixture.storage.currentVersion);
        expect(fixture.storage.currentVersion).toBeGreaterThanOrEqual(1);

        await fixture.dispose();
    });

    test("layered UI presents the economy state through two layer routes", async () => {
        const createTycoonFixture = await loadCreateTycoonFixture();
        const fixture = createTycoonFixture();
        await fixture.start();

        // 分层呈现：normal 层主界面（总览）在下，popup 层生产界面（详情）在上
        const hubOpened = fixture.navigator.open("tycoon/hub", {
            layer: "normal",
        });
        expect(hubOpened.ok).toBe(true);

        const detailOpened = fixture.navigator.open("tycoon/factory", {
            layer: "popup",
        });
        expect(detailOpened.ok).toBe(true);

        // 层序契约：popup 高于 normal，栈顶为生产详情
        expect(fixture.navigator.pages.map((p) => p.layer)).toEqual(["normal", "popup"]);
        expect(fixture.navigator.top?.route).toBe("tycoon/factory");

        // 呈现联动：route 打开后经 ui 钩子读取各层 ViewModel，
        // 总览反映初始现金、详情反映空闲产线
        expect(fixture.ui.hubViewModel.cash).toBe(100);
        expect(fixture.ui.hubViewModel.inventory).toEqual({});
        expect(fixture.ui.factoryViewModel.activeProductId).toBeNull();

        // 驱动生产：总览现金扣除成本、详情显示生产任务
        expect(fixture.production.start("widget")).toBe(true);
        expect(fixture.ui.hubViewModel.cash).toBe(95);
        expect(fixture.ui.factoryViewModel.activeProductId).toBe("widget");

        // 关闭 popup 回到下层 normal 总览
        const closed = fixture.navigator.close();
        expect(closed.ok).toBe(true);
        expect(fixture.navigator.top?.route).toBe("tycoon/hub");

        await fixture.dispose();
    });

    test("failRollback does not disturb the fixture's own capabilities", async () => {
        const createTycoonFixture = await loadCreateTycoonFixture();
        const fixture = createTycoonFixture();
        await fixture.start();

        // 契约保证：探针驱动注定失败的启动并回滚，不改动夹具自身 app 状态
        await fixture.failRollback();

        // 探针后夹具自身能力保持可用（模块 dispose 无副作用，释放归组合根）
        expect(fixture.production.start("widget")).toBe(true);
        fixture.clock.advance(1000);
        fixture.scheduler.tick();
        expect(fixture.economy.inventory["widget"]).toBe(1);

        expect(fixture.navigator.open("tycoon/hub", { layer: "normal" }).ok).toBe(true);

        await fixture.dispose();
    });

    test("dispose stops scheduling and releases shared capabilities", async () => {
        const createTycoonFixture = await loadCreateTycoonFixture();
        const fixture = createTycoonFixture();
        await fixture.start();

        expect(fixture.production.start("widget")).toBe(true);
        fixture.clock.advance(1000);
        fixture.scheduler.tick();
        expect(fixture.economy.inventory["widget"]).toBe(1);

        await fixture.dispose();

        // 释放后：调度不再推进生产、导航拒绝新请求，重复释放幂等
        expect(fixture.production.start("gadget")).toBe(false);
        fixture.clock.advance(2000);
        fixture.scheduler.tick();
        expect(fixture.economy.inventory["gadget"]).toBeUndefined();

        expect(fixture.navigator.open("tycoon/hub", { layer: "normal" }).ok).toBe(false);

        await fixture.dispose();
    });

    test("start rejects when cash is insufficient", async () => {
        const createTycoonFixture = await loadCreateTycoonFixture();
        // 初始现金 3，低于任一产品成本（widget cost 5 / gadget cost 8）
        const fixture = createTycoonFixture({
            configContent: { startCash: 3, products: [] },
        });
        await fixture.start();

        expect(fixture.production.start("widget")).toBe(false);
        expect(fixture.production.state.activeProductId).toBeNull();
        expect(fixture.economy.cash).toBe(3);

        await fixture.dispose();
    });

    test("start rejects while the production line is busy", async () => {
        const createTycoonFixture = await loadCreateTycoonFixture();
        const fixture = createTycoonFixture();
        await fixture.start();

        expect(fixture.production.start("widget")).toBe(true);

        // 产线占用中再次 start 被拒绝，经济状态不变
        const cash = fixture.economy.cash;
        expect(fixture.production.start("gadget")).toBe(false);
        expect(fixture.production.state.activeProductId).toBe("widget");
        expect(fixture.economy.cash).toBe(cash);

        await fixture.dispose();
    });

    test("start and sell reject an unknown product", async () => {
        const createTycoonFixture = await loadCreateTycoonFixture();
        const fixture = createTycoonFixture();
        await fixture.start();

        expect(fixture.production.start("unknown")).toBe(false);
        expect(fixture.production.state.activeProductId).toBeNull();

        expect(fixture.economy.sell("unknown")).toBe(false);
        expect(fixture.economy.cash).toBe(100);

        await fixture.dispose();
    });

    test("a zero-duration product completes on the first tick after start", async () => {
        const createTycoonFixture = await loadCreateTycoonFixture();
        const fixture = createTycoonFixture({
            configContent: {
                startCash: 100,
                products: [{ id: "free", name: "Free", cost: 0, price: 0, durationMs: 0 }],
            },
        });
        await fixture.start();

        expect(fixture.production.start("free")).toBe(true);
        // 未推进时钟：0 时长产品进度恒为 0（durationMs<=0 分支），
        // 但未 tick 前库存未入、任务仍占用产线
        expect(fixture.production.state.progress).toBe(0);
        expect(fixture.production.state.activeProductId).toBe("free");
        expect(fixture.economy.inventory["free"]).toBeUndefined();

        // 首个到期 tick 立即完成（elapsed >= durationMs 0）
        fixture.clock.advance(1000);
        fixture.scheduler.tick();
        expect(fixture.economy.inventory["free"]).toBe(1);
        expect(fixture.production.state.activeProductId).toBeNull();

        await fixture.dispose();
    });

    test("progress clamps to 1 but inventory settles only on tick", async () => {
        // 惰性推导 + tick 结算语义的关键契约：时钟超过时长后，state.progress
        // 显示已完成（clamp 到 1），但 activeProductId 仍非 null、库存未入，
        // 只有调度器 tick 才完成入库存并回到空闲。
        const createTycoonFixture = await loadCreateTycoonFixture();
        const fixture = createTycoonFixture();
        await fixture.start();

        expect(fixture.production.start("widget")).toBe(true);

        // 时钟推进 2000 > durationMs 1000，但未 tick
        fixture.clock.advance(2000);
        expect(fixture.production.state.progress).toBe(1);
        expect(fixture.production.state.activeProductId).toBe("widget");
        expect(fixture.economy.inventory["widget"]).toBeUndefined();

        // tick 完成结算：入库存并回到空闲
        fixture.scheduler.tick();
        expect(fixture.economy.inventory["widget"]).toBe(1);
        expect(fixture.production.state.activeProductId).toBeNull();

        await fixture.dispose();
    });

    test("clock advance rejects negative values", async () => {
        const createTycoonFixture = await loadCreateTycoonFixture();
        const fixture = createTycoonFixture();
        await fixture.start();

        // 时钟只应正向推进：负值推进会破坏生产时长判定
        expect(() => fixture.clock.advance(-1)).toThrow();

        await fixture.dispose();
    });

    test("a failing storage write rejects the save without swallowing the error", async () => {
        const createTycoonFixture = await loadCreateTycoonFixture();
        const failingStorage: PlatformStorage = {
            async get(_key: string): Promise<string | null> {
                return null;
            },
            async set(): Promise<void> {
                throw new Error("storage write failed");
            },
            async delete(): Promise<void> {},
        };

        const fixture = createTycoonFixture({ storage: failingStorage });
        await fixture.start();

        // 存档写入失败向上抛，不吞错、不静默
        await expect(
            fixture.storage.save("tycoon", "economy", {
                cash: 95,
                inventory: { widget: 1 },
            }),
        ).rejects.toThrow("storage write failed");

        await fixture.dispose();
    });

    test("load rejects a corrupt economy record via the shape guard", async () => {
        const createTycoonFixture = await loadCreateTycoonFixture();
        const storage = new MemoryPlatform();
        const fixture = createTycoonFixture({ storage });
        await fixture.start();

        // 版本号合法但 data 形状畸形：cash 为字符串、inventory 含负值——守卫拒绝
        await storage.set("tycoon:ns:bad", JSON.stringify({ version: fixture.storage.currentVersion, data: { cash: "abc", inventory: { widget: -1 } } }));
        expect(await fixture.storage.load("ns", "bad")).toBeNull();

        // 合法经济记录仍可往返（守卫放行）
        await fixture.storage.save("ns", "good", { cash: 100, inventory: {} });
        expect(await fixture.storage.load("ns", "good")).toEqual({
            version: fixture.storage.currentVersion,
            data: { cash: 100, inventory: {} },
        });

        await fixture.dispose();
    });

    test("production advances independently of the Application pause state", async () => {
        // 设计决定固化：生产推进由测试驱动的调度 tick 结算，不随 Application
        // 暂停绑定（夹具层不强制"暂停即停产"，取决于真实游戏设计）
        const createTycoonFixture = await loadCreateTycoonFixture();
        const fixture = createTycoonFixture();
        await fixture.start();

        await fixture.pause();

        // 暂停后仍可经时钟推进 + 调度 tick 完成生产
        expect(fixture.production.start("widget")).toBe(true);
        fixture.clock.advance(1000);
        fixture.scheduler.tick();
        expect(fixture.economy.inventory["widget"]).toBe(1);

        await fixture.resume();
        await fixture.dispose();
    });
});

describe("Tycoon fixture framework boundary", () => {
    test("the framework layer declares no production chain or economy models", () => {
        // 负向断言：生产链/经济模型等业务模型只允许存在于游戏层，框架层不出现
        // 对应类型声明（含裸名与 `Tycoon` 前缀名，防止业务模型以品类前缀命名侵入框架）
        const modelPattern = /\b(?:interface|class|type|enum)\s+(?:(?:Tycoon|Economy|Production|Factory|Inventory|Goods|Sell|Cash|Workshop|Product)\w*)\b/;

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
