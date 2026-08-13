/**
 * 品类入口描述：route 与 FGUI 资源定位（包名/组件名）。列表页与宿主据此
 * 打开真实页面；不可玩品类不登记入口。resolver 声明该入口页需要哪种节点
 * 解析器装配（缺省普通视图解析器），由 game 侧声明、boot 宿主读取——新增
 * 品类页面只需在此声明，无需改 boot 装配层。
 */
export interface GameEntryInfo {
    readonly route: string;
    readonly packageName: string;
    readonly resName: string;
    /**
     * 节点解析器装配方式：缺省 "view"（普通视图解析器）；
     * "dynamic" 装配动态组件解析器（unitNodeMappings 驱动运行时实例化）；
     * "list" 装配列表解析器（含候选 GList 虚拟列表的页面）。
     */
    readonly resolver?: "view" | "dynamic" | "list";
    /** 动态映射键：resolver 为 "dynamic" 时读取 samples 注册桥 unitNodeMappings[key]。 */
    readonly mappingKey?: string;
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
 * 逐一对齐（断言由 game-lobby-catalog.test 锁定）；card 与 auto_battle 为当前
 * 可玩品类，其余四类登记占位。
 */
export const gameTypeCatalog: readonly GameTypeInfo[] = [
    {
        id: "card",
        title: "卡牌对战",
        subtitle: "回合制卡牌",
        entry: {
            route: "card/battle",
            packageName: "CardGame",
            resName: "CardBattleView",
        },
        playable: true,
    },
    {
        id: "auto_battle",
        title: "自动战斗",
        subtitle: "卡牌自动战斗",
        entry: {
            route: "auto_battle/lineup",
            packageName: "AutoBattle",
            resName: "LineupEditorView",
            resolver: "list",
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
 * samples 注册桥 unitNodeMappings 的映射键：战场页动态单位映射（samples 侧
 * entry.ts 的 `unitNodeMappings: { auto_battle: ... }` 键）。boot 经
 * entry.mappingKey 读取，不再硬编码视图名判定。
 */
export const AUTO_BATTLE_UNIT_MAPPING_KEY = "auto_battle";

/**
 * 列表页自身入口：游戏类型主入口页面，常驻于全局 UI 作用域（不随品类会话
 * 释放）。route 标识列表页导航项，包/组件由 FGUI 侧 LobbyView 提供。
 */
export const LOBBY_LIST_ENTRY: GameEntryInfo = {
    route: "lobby/list",
    packageName: "Demo",
    resName: "LobbyView",
};

/**
 * 自动战斗编队页入口：品类主入口（lobby 进入先落编队页编辑布阵），
 * 挂机收益页"返回"经会话内导航切回。
 */
export const AUTO_BATTLE_LINEUP_ENTRY: GameEntryInfo = {
    route: "auto_battle/lineup",
    packageName: "AutoBattle",
    resName: "LineupEditorView",
    resolver: "list",
};

/**
 * 自动战斗战场页入口：编队页点"开始战斗"后经会话内页面切换打开（进入品类
 * 先落编队页编辑布阵，开战再切战场页）。resolver 为 "dynamic"：战场页按
 * 存活单位运行时实例化 UnitSlot/命中反馈特效，boot 经 mappingKey 读取
 * samples 注册桥的 unitNodeMappings 装配动态解析器。
 */
export const AUTO_BATTLE_BATTLE_ENTRY: GameEntryInfo = {
    route: "auto_battle/battle",
    packageName: "AutoBattle",
    resName: "AutoBattleView",
    resolver: "dynamic",
    mappingKey: AUTO_BATTLE_UNIT_MAPPING_KEY,
};

/**
 * 自动战斗挂机收益页入口：编队页点"挂机收益"后经会话内页面切换打开
 * （展示离线预览并领取入账，回编队页继续布阵/开战）。
 */
export const AUTO_BATTLE_IDLE_REWARDS_ENTRY: GameEntryInfo = {
    route: "auto_battle/idle-rewards",
    packageName: "AutoBattle",
    resName: "IdleRewardsView",
};
