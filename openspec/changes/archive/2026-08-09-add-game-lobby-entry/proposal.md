## Why

当前 game_card 真实可玩对战 MVP 只能通过 URL 参数 `?smoke=card-battle` 触发，没有游戏内的可视化主入口；五个游戏品类夹具（card/fight/idle/rpg/tycoon）各自可独立运行，但缺少一个统一进入入口。把 game_card 接入游戏需要一个"游戏列表页"作为各类游戏类型的主入口，让玩家从列表进入品类、退出后回到列表。

## What Changes

- 新增游戏层大厅编排模块 `assets/game/lobby/`（引擎无关、可单测）：品类展示元数据表（catalog）与品类会话编排（lobby），延续 design decision 3「AppRoot 只做薄转发」。
- 新增统一进入/退出协议：按品类 id 打开入口页（加载 package → 建页 → 装配 ViewModelRenderer），退出时关闭页面 + 释放会话作用域 + dispose 夹具；替代 `runCardBattleSmoke` 的一次性硬编码路径。
- AppRoot 实现大厅宿主（`GameLobbyHost`）：复用已验证的 `FairyGuiViewHandle` + ViewModelRenderer 接缝，把"一次性冒烟驱动"固化为"持久会话"；无 URL 参数时默认打开列表页。
- 新增 FGUI 列表页组件（委派 fgui-designer），列表项点击回调驱动 `lobby.enter(id)`；不可玩品类显示占位（`playable: false`）。
- 五类品类：仅 card 可玩，其余四类列表项显示"敬请期待"占位，不进入空页面。
- MVP 限定单会话：`lobby.enter` 在已有活动会话时拒绝重入。

## Capabilities

### New Capabilities

- `game-lobby`: 游戏类型列表页主入口与品类会话编排。包含品类展示元数据、统一进入/退出协议、会话级资源作用域生命周期（进入品类时独立 scope、退出时释放，列表包常驻不受影响）。

### Modified Capabilities

- 无（card-playable-battle 玩法行为不变；ui-navigation / fairygui-ui-adapter / game-composite-fixtures 均为框架既有能力，本 change 不改变其需求语义）。

## Impact

- 新增：`assets/game/lobby/catalog.ts`、`assets/game/lobby/lobby.ts` 及对应测试；FGUI 列表页组件（ui/ 包）。
- 修改：`assets/boot/AppRoot.ts`（宿主实现 + 默认入口 + 移除/收敛 card-battle 冒烟硬编码）；`assets/game/fixture/registry.ts` 保持不动（catalog 单独对齐，不塞进 registry）。
- 测试：`tests/framework/foundation/` 下新增 lobby 编排测试（记录型 host 驱动）；AppRoot 冒烟测试覆盖默认列表页入口。
- 依赖：无新第三方依赖；复用 framework 既有 UiNavigator / ResourceScope / ViewModelRenderer / FairyGuiPageAdapter。
