import { lookupBundle } from "../../framework";
import type { GameFixture } from "../fixture/GameFixture";
import {
    gameFixtureRegistry,
    type GameFixtureRegistry,
} from "../fixture/registry";
import type {
    GamePresenter,
    GamePresenterFactory,
    GameSessionNavigator,
} from "./presenter";
import {
    gameTypeCatalog,
    type GameEntryInfo,
    type GameTypeInfo,
} from "./catalog";
import type {
    EntryPageHandle,
    GameLobbyHost,
} from "./host";

// 类型经 host.ts 共享给 boot 与 game；fixture/lobby.ts 的薄转发依赖本文件
// 继续 re-export 这两个类型（boot 仅 `import type`）。
export type { EntryPageHandle, GameLobbyHost } from "./host";

interface SamplesPresenterModule {
    readonly presenters: Readonly<Record<string, GamePresenterFactory>>;
}

/** 品类呈现器运行时登记表：从 samples bundle 的全局注册读取；samples 未加载时为空。 */
function gamePresenterRegistry(): Readonly<Record<string, GamePresenterFactory>> {
    const samples = lookupBundle("samples") as SamplesPresenterModule | undefined;
    return samples?.presenters ?? {};
}

/** 品类会话：活动中的夹具 + 已打开的入口页句柄 + 呈现器。 */
export interface GameSession {
    readonly id: string;
    readonly fixture: GameFixture;
    readonly page: EntryPageHandle;
    /** 页面呈现器：渲染夹具状态到真实页面；未装配时为 undefined。 */
    readonly presenter?: GamePresenter;
}

/**
 * 品类会话编排选项：可注入受控清单驱动测试，缺省对齐真实清单。
 * catalog/registry 分离使不可玩品类在进入前即可拒绝，不触及夹具装配；
 * presenters 按品类装配呈现器，测试可注入记录型替身。
 */
export interface GameLobbyOptions {
    readonly catalog?: readonly GameTypeInfo[];
    readonly registry?: GameFixtureRegistry;
    readonly presenters?: Readonly<Record<string, GamePresenterFactory>>;
}

/** 品类会话编排：从列表进入/退出品类，单会话、重入拒绝、退出幂等。 */
export interface GameLobby {
    /** 当前活动会话；无会话时为 undefined。 */
    readonly active: GameSession | undefined;
    /**
     * 进入品类：按 catalog 元数据创建夹具 → fixture.start() → openEntryPage →
     * 装配呈现器。已有活动会话时拒绝重入；不可玩/未登记品类抛错且不创建夹具。
     */
    enter(id: string): Promise<GameSession>;
    /** 退出会话：呈现器 dispose → closeEntryPage → fixture.dispose()。重复退出幂等。 */
    exit(): Promise<void>;
}

/**
 * 品类会话编排实现：单会话约束（MVP 限定，重入直接拒绝，不做资源池化）。
 * enter 顺序：建夹具 → start → 打开入口页 → 装配呈现器；
 * exit 顺序：呈现器 dispose → 关闭入口页 → 夹具 dispose。
 *
 * 页面关闭联动：enter 时把"退出会话"登记到入口页作用域（onClose），导航
 * 关闭页面自然触发会话清理；exit 与 closeEntryPage 均幂等，页面关闭回调
 * 与显式 exit 互不循环（exit 先清空 active，重入直接返回）。
 */
export function createGameLobby(
    host: GameLobbyHost,
    options: GameLobbyOptions = {},
): GameLobby {
    const catalog = options.catalog ?? gameTypeCatalog;

    let active: GameSession | undefined;

    function findInfo(id: string): GameTypeInfo | undefined {
        return catalog.find((info) => info.id === id);
    }

    /** 退出会话：释放呈现器、关闭入口页、释放夹具。幂等。 */
    async function doExit(): Promise<void> {
        const session = active;
        if (session === undefined) {
            return;
        }
        // 先清空活动会话，使 onClose 触发的重入 exit 直接返回（防互调循环）
        active = undefined;

        session.presenter?.dispose();
        await host.closeEntryPage(session.page);
        await session.fixture.dispose();
    }

    /**
     * 会话内页面切换：供多页面品类（auto_battle 编队页 → 战场页）的呈现器经
     * GameSessionNavigator 调用。顺序：先释放当前呈现器 → 解除活动身份（使旧页
     * 关闭触发的"退出会话"联动因 active 不再指向本会话而跳过）→ 宿主切换入口页
     * → 装配新呈现器 → 重建活动会话并登记新页退出联动。
     */
    async function switchEntry(
        session: GameSession,
        entry: GameEntryInfo,
        presenterFactory: GamePresenterFactory,
        navigate: GameSessionNavigator,
    ): Promise<void> {
        session.presenter?.dispose();
        active = undefined;

        const page = await host.switchEntryPage(entry);
        const presenter = presenterFactory(session.fixture, page.node, navigate);
        const next: GameSession = {
            id: session.id,
            fixture: session.fixture,
            page,
            presenter,
        };
        active = next;

        page.onClose(() => {
            if (active === next) {
                void doExit();
            }
        });
    }

    return {
        get active() {
            return active;
        },

        async enter(id: string): Promise<GameSession> {
            if (active !== undefined) {
                throw new Error(
                    `game lobby: session "${active.id}" already active, reentry rejected`,
                );
            }

            const info = findInfo(id);
            if (info === undefined) {
                throw new Error(`game lobby: unknown game type "${id}"`);
            }
            if (!info.playable || info.entry === undefined) {
                throw new Error(`game lobby: game type "${id}" is not playable`);
            }

            // 先确保 samples bundle 脚本已执行（登记完成），再解析运行时登记表。
            // 解析放在 enter 调用时而非 createGameLobby 构造时，避免 samples 未
            // 加载前固化空表（host.loadBundle 幂等，Task 6 起为宿主必选能力）。
            await host.loadBundle("samples");
            const registry = options.registry ?? gameFixtureRegistry();
            const presenters = options.presenters ?? gamePresenterRegistry();

            const factory = registry[id];
            if (factory === undefined) {
                throw new Error(`game lobby: no fixture factory for "${id}"`);
            }

            const fixture = factory();
            await fixture.start();

            // 会话内页面导航：多页面品类经呈现器切换入口页（如 auto_battle 编队 → 战场）。
            // openEntry 延迟到微任务执行——呈现器工厂装配期间 active/装配尚未就绪，
            // 立即执行会读到空会话而丢切换
            const navigate: GameSessionNavigator = {
                openEntry: (entry, presenterFactory) => {
                    queueMicrotask(() => {
                        const session = active;
                        if (session === undefined) {
                            return;
                        }
                        void switchEntry(session, entry, presenterFactory, navigate);
                    });
                },
            };

            // 打开入口页：宿主在此建立会话资源作用域并装配真实页面
            const page = await host.openEntryPage(info.entry);

            // 装配呈现器：按品类把夹具状态渲染到真实页面节点（引擎无关）
            const presenterFactory = presenters[id];
            const presenter =
                presenterFactory === undefined
                    ? undefined
                    : presenterFactory(fixture, page.node, navigate);

            const session: GameSession = { id, fixture, page, presenter };
            active = session;

            // 页面关闭联动：导航关闭当前入口页时触发会话退出（幂等兜底）
            page.onClose(() => {
                if (active === session) {
                    void doExit();
                }
            });

            return session;
        },

        async exit(): Promise<void> {
            await doExit();
        },
    };
}
