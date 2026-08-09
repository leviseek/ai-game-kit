import { CARD_BATTLE_ROUTE } from "../../samples/game_card/models";

/**
 * 品类入口描述：route 与 FGUI 资源定位（包名/组件名）。列表页与宿主据此
 * 打开真实页面；不可玩品类不登记入口。
 */
export interface GameEntryInfo {
    readonly route: string;
    readonly packageName: string;
    readonly resName: string;
}

/** 品类展示元数据：列表页渲染与进入协议所需信息，与夹具注册表 id 对齐。 */
export interface GameTypeInfo {
    /** 品类标识，对齐 gameFixtureRegistry 的 key。 */
    readonly id: string;
    readonly title: string;
    readonly subtitle?: string;
    /** FGUI 内图标资源名；可后置，缺省不展示图标。 */
    readonly icon?: string;
    /** 真实入口；playable 为 false 的品类缺省为 undefined（列表显示占位）。 */
    readonly entry?: GameEntryInfo;
    /** 是否可玩：false → 列表项显示"敬请期待"且不可进入。 */
    readonly playable: boolean;
}

/**
 * 游戏类型清单：显式声明，不自动扫描品类目录。id 与 gameFixtureRegistry
 * 逐一对齐（断言由 game-lobby-catalog.test 锁定）；card 为当前唯一可玩品类，
 * 其余四类登记占位。
 */
export const gameTypeCatalog: readonly GameTypeInfo[] = [
    {
        id: "card",
        title: "卡牌对战",
        subtitle: "回合制卡牌",
        entry: {
            route: CARD_BATTLE_ROUTE,
            packageName: "CardGame",
            resName: "BattleView",
        },
        playable: true,
    },
    { id: "fight", title: "格斗", playable: false },
    { id: "idle", title: "挂机", playable: false },
    { id: "rpg", title: "RPG", playable: false },
    { id: "tycoon", title: "经营", playable: false },
];

/** 列表页条目节点名约定：按品类 id 派生 FGUI 按钮节点名（如 "btn_card"）。 */
export function lobbyItemNodeName(id: string): string {
    return `btn_${id}`;
}

/**
 * 列表页自身入口：游戏类型主入口页面，常驻于全局 UI 作用域（不随品类会话
 * 释放）。route 标识列表页导航项，包/组件由 FGUI 侧 LobbyView 提供。
 */
export const LOBBY_LIST_ENTRY: GameEntryInfo = {
    route: "lobby/list",
    packageName: "Demo",
    resName: "LobbyView",
};
