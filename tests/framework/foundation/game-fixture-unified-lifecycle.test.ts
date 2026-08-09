import { describe, expect, test } from "bun:test";

import type { Module } from "../../../assets/framework";
import {
    createGameFixture,
    type GameFixture,
} from "../../../assets/game/fixture/GameFixture";
import { gameFixtureRegistry } from "../../../assets/game/fixture/registry";

// ---- 8.6 统一生命周期测试：以同一驱动对五个夹具执行统一接缝 ----

// 统一驱动：与 8.6 验收口径相同的接缝调用顺序，对任意品类无差异执行
// （start → pause → resume → failRollback → dispose）。五个夹具都必须
// 以同一驱动全部通过，且不需要修改框架内核（core/contracts 禁改，design
// decision 4）；品类内部各自的组合差异只体现在 modules 清单上。
async function driveUniformLifecycle(fixture: GameFixture): Promise<string[]> {
    const steps: string[] = [];
    await fixture.start();
    steps.push("start");
    await fixture.pause();
    steps.push("pause");
    await fixture.resume();
    steps.push("resume");
    await fixture.failRollback();
    steps.push("failRollback");
    await fixture.dispose();
    steps.push("dispose");
    return steps;
}

// 品类登记表：五类夹具全部登记（task 1.3 约定 2.x-6.x 逐类登记）
const fixtureIds = ["rpg", "card", "idle", "tycoon", "fight"] as const;

describe("8.6 unified lifecycle test", () => {
    test("the registry exposes exactly the five declared fixtures", () => {
        const registered = Object.keys(gameFixtureRegistry).sort();
        expect(registered).toEqual([...fixtureIds].sort());
    });

    for (const fixtureId of fixtureIds) {
        test(`fixture "${fixtureId}" passes the unified lifecycle driver`, async () => {
            const fixture = gameFixtureRegistry[fixtureId]();
            expect(fixture.id).toBe(fixtureId);
            expect(Array.isArray(fixture.modules)).toBe(true);
            expect(fixture.modules.length).toBeGreaterThan(0);

            const steps = await driveUniformLifecycle(fixture);
            expect(steps).toEqual([
                "start",
                "pause",
                "resume",
                "failRollback",
                "dispose",
            ]);
        });
    }
});

describe("8.6 failure rollback leaves no half-started state", () => {
    // 记录型模块：把生命周期钩子调用顺序写入 log，供回滚顺序断言
    function createRecordingModule(id: string, log: string[]): Module {
        return {
            id,
            dependencies: [],
            initialize: () => {
                log.push(`${id}:initialize`);
            },
            start: () => {
                log.push(`${id}:start`);
            },
            stop: () => {
                log.push(`${id}:stop`);
            },
            dispose: () => {
                log.push(`${id}:dispose`);
            },
        };
    }

    test("a failing startup module rolls back started modules into the disposed terminal state", async () => {
        const log: string[] = [];
        const failingModule: Module = {
            id: "failing",
            dependencies: [],
            start: () => {
                log.push("failing:start");
                throw new Error("forced startup failure");
            },
        };
        const fixture = createGameFixture({
            id: "rollback",
            modules: [
                createRecordingModule("alpha", log),
                createRecordingModule("beta", log),
                failingModule,
            ],
        });

        // 启动中某模块失败：start 接缝 reject（框架包装为 ModuleLifecycleError）
        await expect(fixture.start()).rejects.toThrow();

        // 已启动模块逆序回滚：先 stop 已 started 模块，再 dispose 全部注册模块，
        // 后启动的模块先清理（beta 后于 alpha 启动，先被 stop/dispose）
        expect(log.indexOf("beta:stop")).toBeLessThan(log.indexOf("alpha:stop"));
        expect(log.indexOf("beta:dispose")).toBeLessThan(
            log.indexOf("alpha:dispose"),
        );

        // disposed 终态下释放幂等：重复 dispose 是安全的 no-op
        await expect(fixture.dispose()).resolves.toBeUndefined();
        await expect(fixture.dispose()).resolves.toBeUndefined();
    });

    test("a fixture can be rebuilt after a failed startup", async () => {
        // 首次启动失败进入 disposed 终态后，新建实例可正常走完整生命周期
        const log: string[] = [];
        const failingModule: Module = {
            id: "failing",
            dependencies: [],
            start: () => {
                throw new Error("boom");
            },
        };
        const first = createGameFixture({
            id: "rebuilt",
            modules: [createRecordingModule("alpha", log), failingModule],
        });
        await expect(first.start()).rejects.toThrow();

        const rebuilt = createGameFixture({
            id: "rebuilt",
            modules: [createRecordingModule("alpha", log)],
        });
        await expect(driveUniformLifecycle(rebuilt)).resolves.toEqual([
            "start",
            "pause",
            "resume",
            "failRollback",
            "dispose",
        ]);
    });

    test("the five real fixtures roll back without leaving their own apps disturbed", async () => {
        // 每类夹具的 failRollback 探针复用同一批模块实例但独立状态机：
        // 探针后夹具自身 app 仍保持 running，pause/resume 接缝可继续驱动
        for (const fixtureId of fixtureIds) {
            const fixture = gameFixtureRegistry[fixtureId]();
            await fixture.start();
            await fixture.failRollback();

            await expect(fixture.pause()).resolves.toBeUndefined();
            await expect(fixture.resume()).resolves.toBeUndefined();
            await expect(fixture.dispose()).resolves.toBeUndefined();
        }
    });
});
