import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import { createSmokeRouter, type SmokeRouter, type SmokeRouterDeps } from "../../../assets/boot/flow/SmokeRouter";

const projectRoot = resolve(import.meta.dir, "../../..");
const smokeRouterFile = resolve(projectRoot, "assets/boot/flow/SmokeRouter.ts");

interface CalledAction {
    readonly tag: string;
    readonly args: readonly unknown[];
}

async function loadSmokeRouter(): Promise<{
    router: SmokeRouter;
    called: CalledAction[];
}> {
    const called: CalledAction[] = [];
    const deps: SmokeRouterDeps = {
        runUiSmoke: () => {
            called.push({ tag: "ui-smoke", args: [] });
            return Promise.resolve();
        },
        runSceneFlowSmoke: () => {
            called.push({ tag: "scene-smoke", args: [] });
            return Promise.resolve();
        },
        runModalClickSmoke: () => {
            called.push({ tag: "modal-click", args: [] });
            return Promise.resolve();
        },
        runCardBattleSmoke: () => {
            called.push({ tag: "card-battle", args: [] });
            return Promise.resolve();
        },
        runAutoBattleSmoke: () => {
            called.push({ tag: "auto-battle", args: [] });
            return Promise.resolve();
        },
        runFixtureSmoke: (fixtureId: string) => {
            called.push({ tag: "fixture-smoke", args: [fixtureId] });
            return Promise.resolve();
        },
        runFixturePerf: (perfFixtureId: string) => {
            called.push({ tag: "fixture-perf", args: [perfFixtureId] });
            return Promise.resolve();
        },
    };
    return { router: createSmokeRouter(deps), called };
}

describe("SmokeRouter URL dispatch", () => {
    test("maps smoke=fairygui-ui to the ui smoke runner", async () => {
        const { router, called } = await loadSmokeRouter();

        const action = router.resolve("?smoke=fairygui-ui");
        expect(action?.tag).toBe("ui-smoke");
        await action?.run();

        expect(called).toEqual([{ tag: "ui-smoke", args: [] }]);
    });

    test("maps smoke=scene-flow to the scene flow smoke runner", async () => {
        const { router, called } = await loadSmokeRouter();

        const action = router.resolve("?smoke=scene-flow");
        expect(action?.tag).toBe("scene-smoke");
        await action?.run();

        expect(called).toEqual([{ tag: "scene-smoke", args: [] }]);
    });

    test("maps smoke=modal-click to the modal click smoke runner", async () => {
        const { router, called } = await loadSmokeRouter();

        const action = router.resolve("?smoke=modal-click");
        expect(action?.tag).toBe("modal-click");
        await action?.run();

        expect(called).toEqual([{ tag: "modal-click", args: [] }]);
    });

    test("maps smoke=card-battle to the card battle smoke runner", async () => {
        const { router, called } = await loadSmokeRouter();

        const action = router.resolve("?smoke=card-battle");
        expect(action?.tag).toBe("card-battle");
        await action?.run();

        expect(called).toEqual([{ tag: "card-battle", args: [] }]);
    });

    test("maps smoke=auto-battle to the auto battle smoke runner", async () => {
        const { router, called } = await loadSmokeRouter();

        const action = router.resolve("?smoke=auto-battle");
        expect(action?.tag).toBe("auto-battle");
        await action?.run();

        expect(called).toEqual([{ tag: "auto-battle", args: [] }]);
    });

    test("maps fixture=<id> to the fixture smoke runner with the fixture id", async () => {
        const { router, called } = await loadSmokeRouter();

        const action = router.resolve("?fixture=card");
        expect(action?.tag).toBe("fixture-smoke");
        await action?.run();

        expect(called).toEqual([{ tag: "fixture-smoke", args: ["card"] }]);
    });

    test("maps fixture-perf=<id> to the fixture perf runner with the fixture id", async () => {
        const { router, called } = await loadSmokeRouter();

        const action = router.resolve("?fixture-perf=card");
        expect(action?.tag).toBe("fixture-perf");
        await action?.run();

        expect(called).toEqual([{ tag: "fixture-perf", args: ["card"] }]);
    });

    test("returns null for no smoke parameters so the default flow runs", async () => {
        const { router } = await loadSmokeRouter();

        expect(router.resolve("")).toBeNull();
        expect(router.resolve("?lang=zh")).toBeNull();
    });
});

describe("SmokeRouter source wiring", () => {
    test("parses all seven URL smoke branches", () => {
        expect(existsSync(smokeRouterFile)).toBe(true);

        const source = readFileSync(smokeRouterFile, "utf8");

        expect(source).toMatch(/params\.get\("smoke"\) === "fairygui-ui"/);
        expect(source).toMatch(/params\.get\("smoke"\) === "scene-flow"/);
        expect(source).toMatch(/params\.get\("smoke"\) === "modal-click"/);
        expect(source).toMatch(/params\.get\("smoke"\) === "card-battle"/);
        expect(source).toMatch(/params\.get\("smoke"\) === "auto-battle"/);
        expect(source).toMatch(/params\.get\("fixture"\)/);
        expect(source).toMatch(/params\.get\("fixture-perf"\)/);
    });
});
