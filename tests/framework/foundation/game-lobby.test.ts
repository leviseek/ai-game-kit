import { describe, expect, test } from "bun:test";

import type { GameFixture } from "../../../assets/game/fixture/GameFixture";
import type { GamePresenterFactory } from "../../../assets/game/lobby/presenter";
import {
    createGameLobby,
    type EntryPageHandle,
    type GameLobby,
    type GameLobbyHost,
} from "../../../assets/game/lobby/lobby";
import type { GameTypeInfo } from "../../../assets/game/lobby/catalog";

// ---- 记录型替身：记录生命周期调用顺序，供编排顺序断言 ----

/** 记录型夹具：start/dispose 写入 log，验证 enter/exit 的生命周期顺序。 */
function createRecordingFixture(log: string[], id: string): GameFixture {
    return {
        id,
        modules: [],
        start: async () => {
            log.push(`start:${id}`);
        },
        pause: async () => { },
        resume: async () => { },
        failRollback: async () => { },
        dispose: async () => {
            log.push(`dispose:${id}`);
        },
    };
}

/** 记录型宿主：openEntryPage/closeEntryPage 写入 log，并捕获 onClose 回调。 */
function createRecordingHost(log: string[]): {
    host: GameLobbyHost;
    closeCallbacks: (() => void)[];
} {
    const closeCallbacks: (() => void)[] = [];
    return {
        host: {
            openEntryPage: async (entry) => {
                log.push(`open:${entry.route}`);
                const handle: EntryPageHandle = {
                    node: () => undefined,
                    onClose: (callback: () => void) => {
                        // 记录回调，测试可手动触发模拟导航关闭页面
                        closeCallbacks.push(callback);
                    },
                };
                return handle;
            },
            closeEntryPage: async () => {
                log.push("close");
            },
        },
        closeCallbacks,
    };
}

const TEST_CATALOG: readonly GameTypeInfo[] = [
    {
        id: "card",
        title: "卡牌",
        entry: { route: "card/battle", packageName: "CardGame", resName: "BattleView" },
        playable: true,
    },
    { id: "rpg", title: "RPG", playable: false },
];

function createTestRegistry(log: string[]) {
    return {
        card: () => createRecordingFixture(log, "card"),
        rpg: () => createRecordingFixture(log, "rpg"),
    };
}

/** 记录型呈现器：装配/销毁写入 log，验证会话对呈现器的生命周期编排。 */
function createTestPresenters(log: string[]): Readonly<Record<string, GamePresenterFactory>> {
    return {
        card: (_fixture, _node) => ({
            render: () => {
                log.push("presenter.render");
            },
            dispose: () => {
                log.push("presenter.dispose");
            },
        }),
    };
}

describe("game lobby orchestration", () => {
    test("enter runs fixture.start before opening the entry page", async () => {
        const log: string[] = [];
        const { host } = createRecordingHost(log);
        const lobby = createGameLobby(host, {
            catalog: TEST_CATALOG,
            registry: createTestRegistry(log),
            presenters: createTestPresenters(log),
        });

        const session = await lobby.enter("card");

        expect(log).toEqual(["start:card", "open:card/battle"]);
        expect(session.presenter).toBeDefined();
        expect(session.id).toBe("card");
        expect(lobby.active?.id).toBe("card");
    });

    test("exit disposes presenter before closing the page and the fixture", async () => {
        const log: string[] = [];
        const { host } = createRecordingHost(log);
        const lobby = createGameLobby(host, {
            catalog: TEST_CATALOG,
            registry: createTestRegistry(log),
            presenters: createTestPresenters(log),
        });

        await lobby.enter("card");
        log.length = 0;

        await lobby.exit();

        expect(log).toEqual(["presenter.dispose", "close", "dispose:card"]);
        expect(lobby.active).toBeUndefined();
    });

    test("reentry while a session is active is rejected", async () => {
        const log: string[] = [];
        const { host } = createRecordingHost(log);
        const lobby = createGameLobby(host, {
            catalog: TEST_CATALOG,
            registry: createTestRegistry(log),
            presenters: createTestPresenters(log),
        });

        await lobby.enter("card");

        await expect(lobby.enter("card")).rejects.toThrow(/already active/);
        // 重入拒绝不改变活动会话
        expect(lobby.active?.id).toBe("card");
        expect(log.filter((entry) => entry.startsWith("start:"))).toEqual([
            "start:card",
        ]);
    });

    test("exit is idempotent", async () => {
        const log: string[] = [];
        const { host } = createRecordingHost(log);
        const lobby = createGameLobby(host, {
            catalog: TEST_CATALOG,
            registry: createTestRegistry(log),
            presenters: createTestPresenters(log),
        });

        await lobby.enter("card");
        await lobby.exit();
        log.length = 0;

        await lobby.exit();

        expect(log).toEqual([]);
        expect(lobby.active).toBeUndefined();
    });

    test("unplayable game type is rejected before creating a fixture", async () => {
        const log: string[] = [];
        const { host } = createRecordingHost(log);
        const lobby = createGameLobby(host, {
            catalog: TEST_CATALOG,
            registry: createTestRegistry(log),
            presenters: createTestPresenters(log),
        });

        await expect(lobby.enter("rpg")).rejects.toThrow(/not playable/);
        expect(log).toEqual([]);
    });

    test("page close triggers session exit through the registered callback", async () => {
        const log: string[] = [];
        const { host, closeCallbacks } = createRecordingHost(log);
        const lobby = createGameLobby(host, {
            catalog: TEST_CATALOG,
            registry: createTestRegistry(log),
            presenters: createTestPresenters(log),
        });

        await lobby.enter("card");
        log.length = 0;

        // 模拟导航关闭入口页：触发登记在页面作用域的 onClose 回调
        expect(closeCallbacks.length).toBe(1);
        closeCallbacks[0]?.();

        // exit 先清空活动会话（同步），异步清理链路随后落定
        expect(lobby.active).toBeUndefined();
        await lobby.exit();
        await Promise.resolve();
        expect(log).toEqual(["presenter.dispose", "close", "dispose:card"]);
    });

    test("unknown game type is rejected", async () => {
        const log: string[] = [];
        const { host } = createRecordingHost(log);
        const lobby = createGameLobby(host, {
            catalog: TEST_CATALOG,
            registry: createTestRegistry(log),
            presenters: createTestPresenters(log),
        });

        await expect(lobby.enter("no-such-game")).rejects.toThrow(/unknown game type/);
    });
});
