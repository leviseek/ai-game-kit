import type { ViewModelNode } from "../../framework";
import type { GameFixture } from "../fixture/GameFixture";
import {
    gameFixtureRegistry,
    type GameFixtureRegistry,
} from "../fixture/registry";
import {
    gamePresenterRegistry,
    type GamePresenter,
    type GamePresenterFactory,
} from "./presenter";
import {
    gameTypeCatalog,
    type GameEntryInfo,
    type GameTypeInfo,
} from "./catalog";

/**
 * 品类会话编排的宿主接缝：真实 UI 宿主（boot/AppRoot）注入打开/关闭入口页
 * 的能力。lobby 保持引擎无关，页面呈现细节（package 加载、pageAdapter、
 * FairyGuiViewHandle 节点解析器）留在宿主实现，lobby 只编排夹具生命周期、
 * 呈现器装配与会话作用域顺序（design decision 3：AppRoot 只做薄转发）。
 */
export interface GameLobbyHost {
    /**
     * 打开品类入口页并返回会话页面句柄。会话资源作用域（品类 package 持有）
     * 由宿主在此建立并绑定到句柄，exit 时经 closeEntryPage 逆序释放。
     * 句柄暴露真实页面的节点解析器，供 lobby 装配品类呈现器（ViewModelRenderer）。
     */
    openEntryPage(entry: GameEntryInfo): Promise<EntryPageHandle>;
    /** 关闭入口页并释放会话作用域。重复关闭幂等。 */
    closeEntryPage(handle: EntryPageHandle): Promise<void>;
}

/**
 * 会话页面句柄：承载"页面关闭 → 会话退出"联动与真实页面节点解析器。
 * 宿主把关闭回调登记进真实页面作用域（如 UiPage.addDisposable），导航关闭
 * 页面时触发；重复登记幂等。页面关闭联动保证返回键只关页面也能触发会话
 * 清理，不遗留运行中的夹具。
 */
export interface EntryPageHandle {
    /** 真实页面节点解析器：按名解析 fgui 节点，供呈现器装配渲染。 */
    readonly node: (name: string) => ViewModelNode | undefined;
    /** 注册页面关闭回调：导航关闭该页面时触发一次（幂等）。 */
    onClose(callback: () => void): void;
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
    const registry = options.registry ?? gameFixtureRegistry;
    const presenters = options.presenters ?? gamePresenterRegistry;

    let active: GameSession | undefined;

    function findInfo(id: string): GameTypeInfo | undefined {
        return catalog.find((info) => info.id === id);
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

            const factory = registry[id];
            if (factory === undefined) {
                throw new Error(`game lobby: no fixture factory for "${id}"`);
            }

            const fixture = factory();
            await fixture.start();

            // 打开入口页：宿主在此建立会话资源作用域并装配真实页面
            const page = await host.openEntryPage(info.entry);

            // 装配呈现器：按品类把夹具状态渲染到真实页面节点（引擎无关）
            const presenterFactory = presenters[id];
            const presenter =
                presenterFactory === undefined
                    ? undefined
                    : presenterFactory(fixture, page.node);

            const session: GameSession = { id, fixture, page, presenter };
            active = session;

            // 页面关闭联动：导航关闭入口页时触发会话退出（幂等兜底）
            page.onClose(() => {
                void this.exit();
            });

            return session;
        },

        async exit(): Promise<void> {
            const session = active;
            if (session === undefined) {
                return;
            }
            // 先清空活动会话，使 onClose 触发的重入 exit 直接返回（防互调循环）
            active = undefined;

            session.presenter?.dispose();
            await host.closeEntryPage(session.page);
            await session.fixture.dispose();
        },
    };
}
