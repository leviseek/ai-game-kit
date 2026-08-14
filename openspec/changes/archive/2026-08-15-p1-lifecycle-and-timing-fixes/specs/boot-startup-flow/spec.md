## Purpose

固化启动/会话宿主的三处生命周期修复：会话内页面切换不再传占位句柄（`closeActiveSession` 收敛关闭）、`UiHost.dispose` 接线释放 UI 根（window resize 监听随宿主释放）、lobby 加载失败失效 failed 终态缓存使瞬时失败可重试。

## ADDED Requirements

### Requirement: 会话切换与关闭共用收敛关闭路径

`GameLobbyHost.switchEntryPage` SHALL 与 `closeEntryPage` 共用同一内部会话关闭实现（关闭导航页 → 销毁入口页 → 释放会话作用域，失败隔离聚合），SHALL NOT 以占位/伪造句柄调用 `closeEntryPage`；`closeEntryPage` 的句柄参数 SHALL 仅为契约兼容保留，会话状态由宿主持有；重复关闭/无活动会话 SHALL 幂等。

#### Scenario: 会话内页面切换不传伪造句柄

- **WHEN** auto_battle 编队页切换至战场页（switchEntryPage）
- **THEN** 当前会话被同一收敛路径关闭（导航/页面/作用域），随后打开新入口页，源码中不存在 `closeEntryPage(undefined)` 类伪造传参

### Requirement: UI 根宿主随 UiHost 释放

`UiHost.dispose` SHALL 释放其持有的 UI 根宿主（`uiRoot.dispose`：退订 window resize 监听、清空 GRoot 引用），作为释放序列的组成部分（单步失败隔离，聚合进 `FuiViewCleanupError`）；AppRoot 销毁经 UiHost 单一释放点完成，不残留 window 监听。

#### Scenario: UiHost 释放触发 UI 根释放

- **WHEN** `UiHost.dispose` 执行
- **THEN** `uiRoot.dispose` 被调用，window resize 监听退订、GRoot 引用清空

### Requirement: 加载失败失效终态缓存可重试

会话/全局页包加载失败与 bundle 加载失败后，宿主 SHALL 失效对应资源键的终态缓存（`invalidatePackage`/`invalidate`），使下次进入/重试重新触发底层加载，而非复用 LoadCoordinator 的 failed 终态。

#### Scenario: 包加载瞬时失败后可重试

- **WHEN** 首次 `openEntryPage` 因瞬时失败拒绝，随后再次进入
- **THEN** 底层加载被重新触发（失败终态已被失效），不再直接复用失败结果
