import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test, mock } from "bun:test";

mock.module("cc", () => ({
    game: {
        on(_event: string, _callback: () => void, _target: unknown) { },
        off(_event: string, _callback: () => void, _target: unknown) { },
    },
    Game: {
        EVENT_HIDE: "game_hide",
        EVENT_SHOW: "game_show",
    },
}));

interface ApplicationLike {
    readonly state: string;
    pause(): Promise<void>;
    resume(): Promise<void>;
}

interface CocosGameLike {
    on(event: string, callback: () => void, target: unknown): void;
    off(event: string, callback: () => void, target: unknown): void;
}

interface CocosAdapterInstance {
    bind(): void;
    unbind(): void;
}

type CocosAdapterConstructor = new (
    app: ApplicationLike,
    game?: CocosGameLike,
) => CocosAdapterInstance;

interface CocosAdapterExports {
    readonly CocosApplicationAdapter?: CocosAdapterConstructor;
}

const projectRoot = resolve(import.meta.dir, "../../..");
const adapterFile = resolve(
    projectRoot,
    "assets/framework/adapters/cocos/application/CocosApplicationAdapter.ts",
);

async function loadAdapter(): Promise<CocosAdapterConstructor> {
    const exports = (await import(
        pathToFileURL(adapterFile).href
    )) as CocosAdapterExports;

    expect(typeof exports.CocosApplicationAdapter).toBe("function");

    return exports.CocosApplicationAdapter as CocosAdapterConstructor;
}

function createMockApp(
    pauseCalls: string[],
    resumeCalls: string[],
): ApplicationLike {
    return {
        state: "running",
        pause: mock(async () => { pauseCalls.push("pause"); }),
        resume: mock(async () => { resumeCalls.push("resume"); }),
    };
}

describe("CocosApplicationAdapter", () => {
    test("accepts an Application instance and an optional game instance", async () => {
        const CocosAdapter = await loadAdapter();

        const pauseCalls: string[] = [];
        const resumeCalls: string[] = [];
        const app = createMockApp(pauseCalls, resumeCalls);
        const adapter = new CocosAdapter(app);

        expect(adapter).toBeDefined();
        expect(typeof adapter.bind).toBe("function");
        expect(typeof adapter.unbind).toBe("function");
    });

    test("bind registers hide and show event listeners", async () => {
        const CocosAdapter = await loadAdapter();

        const onCalls: Array<[string, () => void, unknown]> = [];
        const offCalls: Array<[string, () => void, unknown]> = [];

        const mockGame: CocosGameLike = {
            on(event, callback, target) {
                onCalls.push([event, callback, target]);
            },
            off(event, callback, target) {
                offCalls.push([event, callback, target]);
            },
        };

        const pauseCalls: string[] = [];
        const resumeCalls: string[] = [];
        const app = createMockApp(pauseCalls, resumeCalls);

        const adapter = new CocosAdapter(app, mockGame);
        adapter.bind();

        expect(onCalls).toHaveLength(2);
        expect(onCalls[0]?.[0]).toBe("game_hide");
        expect(onCalls[1]?.[0]).toBe("game_show");
    });

    test("hide event triggers Application.pause", async () => {
        const CocosAdapter = await loadAdapter();

        let hideCallback: (() => void) | undefined;
        let _showCallback: (() => void) | undefined;

        const mockGame: CocosGameLike = {
            on(event, callback, _target) {
                if (event === "game_hide") hideCallback = callback;
                if (event === "game_show") _showCallback = callback;
            },
            off() { },
        };

        const pauseCalls: string[] = [];
        const resumeCalls: string[] = [];
        const app = createMockApp(pauseCalls, resumeCalls);

        const adapter = new CocosAdapter(app, mockGame);
        adapter.bind();

        expect(hideCallback).toBeDefined();

        hideCallback?.();

        await new Promise<void>((r) => setTimeout(r, 0));

        expect(pauseCalls).toEqual(["pause"]);
        expect(resumeCalls).toEqual([]);
    });

    test("show event triggers Application.resume", async () => {
        const CocosAdapter = await loadAdapter();

        let _hideCallback: (() => void) | undefined;
        let showCallback: (() => void) | undefined;

        const mockGame: CocosGameLike = {
            on(event, callback, _target) {
                if (event === "game_hide") _hideCallback = callback;
                if (event === "game_show") showCallback = callback;
            },
            off() { },
        };

        const pauseCalls: string[] = [];
        const resumeCalls: string[] = [];
        const app = createMockApp(pauseCalls, resumeCalls);

        const adapter = new CocosAdapter(app, mockGame);
        adapter.bind();

        expect(showCallback).toBeDefined();

        showCallback?.();

        await new Promise<void>((r) => setTimeout(r, 0));

        expect(resumeCalls).toEqual(["resume"]);
        expect(pauseCalls).toEqual([]);
    });

    test("unbind deregisters hide and show event listeners", async () => {
        const CocosAdapter = await loadAdapter();

        let hideCallback: (() => void) | undefined;
        let showCallback: (() => void) | undefined;

        const offCalls: Array<[string, () => void, unknown]> = [];

        const mockGame: CocosGameLike = {
            on(event, callback, _target) {
                if (event === "game_hide") hideCallback = callback;
                if (event === "game_show") showCallback = callback;
            },
            off(event, callback, target) {
                offCalls.push([event, callback, target]);
            },
        };

        const pauseCalls: string[] = [];
        const resumeCalls: string[] = [];
        const app = createMockApp(pauseCalls, resumeCalls);

        const adapter = new CocosAdapter(app, mockGame);
        adapter.bind();
        adapter.unbind();

        expect(offCalls).toHaveLength(2);
        expect(offCalls[0]?.[0]).toBe("game_hide");
        expect(offCalls[0]?.[1]).toBe(hideCallback);
        expect(offCalls[1]?.[0]).toBe("game_show");
        expect(offCalls[1]?.[1]).toBe(showCallback);
    });

    test("does not crash when pause rejects", async () => {
        const CocosAdapter = await loadAdapter();

        let hideCallback: (() => void) | undefined;
        const rejectError = new Error("cannot pause now");

        const mockGame: CocosGameLike = {
            on(event, callback) {
                if (event === "game_hide") hideCallback = callback;
            },
            off() { },
        };

        const app: ApplicationLike = {
            state: "created",
            pause: mock(async () => { throw rejectError; }),
            resume: mock(async () => { }),
        };

        const adapter = new CocosAdapter(app, mockGame);
        adapter.bind();

        await expect(
            (async () => {
                hideCallback?.();
                await new Promise<void>((r) => setTimeout(r, 0));
            })(),
        ).resolves.toBeUndefined();
    });

    test("does not crash when resume rejects", async () => {
        const CocosAdapter = await loadAdapter();

        let showCallback: (() => void) | undefined;
        const rejectError = new Error("cannot resume now");

        const mockGame: CocosGameLike = {
            on(event, callback) {
                if (event === "game_show") showCallback = callback;
            },
            off() { },
        };

        const app: ApplicationLike = {
            state: "created",
            pause: mock(async () => { }),
            resume: mock(async () => { throw rejectError; }),
        };

        const adapter = new CocosAdapter(app, mockGame);
        adapter.bind();

        await expect(
            (async () => {
                showCallback?.();
                await new Promise<void>((r) => setTimeout(r, 0));
            })(),
        ).resolves.toBeUndefined();
    });

    test("double bind does not register duplicate listeners", async () => {
        const CocosAdapter = await loadAdapter();

        const onCalls: Array<[string, () => void, unknown]> = [];

        const mockGame: CocosGameLike = {
            on(event, callback, target) {
                onCalls.push([event, callback, target]);
            },
            off() { },
        };

        const pauseCalls: string[] = [];
        const resumeCalls: string[] = [];
        const app = createMockApp(pauseCalls, resumeCalls);

        const adapter = new CocosAdapter(app, mockGame);
        adapter.bind();
        adapter.bind();

        expect(onCalls).toHaveLength(2);
        expect(onCalls[0]?.[0]).toBe("game_hide");
        expect(onCalls[1]?.[0]).toBe("game_show");
    });

    test("unbind then rebind restores listener registration", async () => {
        const CocosAdapter = await loadAdapter();

        const onCalls: Array<[string, () => void, unknown]> = [];

        const mockGame: CocosGameLike = {
            on(event, callback, target) {
                onCalls.push([event, callback, target]);
            },
            off() { },
        };

        const pauseCalls: string[] = [];
        const resumeCalls: string[] = [];
        const app = createMockApp(pauseCalls, resumeCalls);

        const adapter = new CocosAdapter(app, mockGame);
        adapter.bind();
        adapter.unbind();

        expect(onCalls).toHaveLength(2);

        adapter.bind();

        expect(onCalls).toHaveLength(4);
        expect(onCalls[2]?.[0]).toBe("game_hide");
        expect(onCalls[3]?.[0]).toBe("game_show");
    });
});
