/**
 * 跨品类会话编排的公共装配入口：组合根（boot/AppRoot）只允许经 game/fixture
 * 薄转发访问游戏层（design decision 3/4），本文件把 lobby 编排与列表页元数据
 * 暴露给组合根，避免 AppRoot 直接导入游戏层业务模块。lobby 实现保持引擎无关。
 */
export {
    createGameLobby,
    type EntryPageHandle,
    type GameLobby,
    type GameLobbyHost,
    type GameLobbyOptions,
    type GameSession,
} from "../lobby/lobby";
export {
    gameTypeCatalog,
    lobbyItemNodeName,
    LOBBY_LIST_ENTRY,
    type GameEntryInfo,
    type GameTypeInfo,
} from "../lobby/catalog";
export type { GamePresenter, GamePresenterFactory } from "../lobby/presenter";
