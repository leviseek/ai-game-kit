## Context

现有 game_card 真实可玩链路只有一个入口：`AppRoot.runCardBattleSmoke()`（assets/boot/AppRoot.ts:674）。它是 URL 参数 `?smoke=card-battle` 触发的一次性冒烟，硬编码了 `CardGame/CardGame` 包、`BattleView` 页面、`createFairyGuiViewHandle` 接缝与 `runCardBattleSmoke(node, report)`（assets/game/fixture/smoke.ts，引擎无关）。五个品类夹具（assets/game_card|game_fight|game_idle|game_rpg|game_tycoon/assembly.ts）各持有独立的逻辑 UiNavigator，但与 AppRoot 的真实 pageAdapter 不连通。`FairyGuiPageAdapter.createPage(route, layer, {packageName, resName})` 已参数化、不内建路由表（assets/framework/adapters/cocos/ui/FairyGuiPageAdapter.ts）；`ResourceScope` 只提供 `retain(handle)` 与 `release()`（全量释放）。动机见 proposal.md - Why。

## Goals / Non-Goals

**Goals:**

- 把"冒烟时代一次性硬编码的进入路径"固化为游戏层大厅编排模块（catalog + lobby），AppRoot 只做宿主注入与默认触发。
- 建立统一的"进入品类 → 真实页面 → 退出会话"生命周期，资源经会话作用域正确释放，列表包常驻不受影响。
- 无 URL 参数时默认打开列表页作为主入口。

**Non-Goals:**

- 不做多会话并发/资源池化（MVP 单会话，重入拒绝）。
- 不实现 fight/idle/rpg/tycoon 的真实页面（仅列表占位）。
- 不改变五个品类夹具内部的行为契约（game-composite-fixtures 需求不变）。
- 不把夹具内部 navigator 接到真实 pageAdapter（破坏 game_* 禁依赖 fgui 边界）。

## Decisions

### D1：大厅做成游戏层薄编排模块，而非 GameFixture 或 AppRoot 硬编码

新增 `assets/game/lobby/`：

- `catalog.ts`：纯数据 `GameTypeInfo[]`（id/title/playable/entry{route, packageName, resName}），显式清单不自动扫描；id 与 `gameFixtureRegistry`（assets/game/fixture/registry.ts）对齐。
- `lobby.ts`：`createGameLobby(host)`，引擎无关；`enter(id)` / `exit()` / `active`，单会话、重入拒绝。

**为什么**：GameFixture 契约语义是"被进入的游戏本体"，大厅嵌套五个子夹具会导致组合清单动态化、生命周期递归；塞进 AppRoot 会复现 `runCardBattleSmoke` 的硬编码覆辙，违背 design decision 3「组合逻辑留在游戏层」。大厅正是跨品类编排点的正当归属。

**备选**：A) 大厅做成嵌套 GameFixture——否决，生命周期递归且违背显式组合清单；B) 逻辑写进 AppRoot——否决，违背 design decision 3。

### D2：呈现统一走宿主侧，夹具 navigator 保持逻辑栈

真实页面只能经 `AppRoot.ensurePageAdapter()` + pageAdapter.createPage/mount 创建；夹具内部 navigator 是纯逻辑栈，不与真实 UI 相连。MVP 明确：呈现统一走宿主侧，夹具通过 `viewModel` 钩子（CardFixture.viewModel.render/node）暴露渲染能力。这是 `runCardBattleSmoke` 已验证的模式，将其持久化。

**为什么**：让夹具 navigator 驱动真实页面需把 fgui 类型传入游戏层，破坏 design decision 7（game_* 禁止依赖 fgui）。宿主侧负责 `createFairyGuiViewHandle(page.view)` 注入节点解析器。

### D3：会话级资源作用域

`ResourceScope.release()` 是全量释放。因此：列表包由 AppRoot 全局 `uiScope` 常驻持有；每次 `enter(id)` 由宿主新建独立会话 scope 并 retain 品类包，`exit()` 时 `sessionScope.release()` + 关闭页面 + `fixture.dispose()`。品类包退出后 `smokeCanUnload("ui")` 语义成立（品类包可卸载、列表包保留）。

**备选**：复用全局 uiScope——否决，退出品类时全量 release 会连列表包一起卸载。

### D4：页面关闭联动会话退出，经 UiPage 作用域登记

`UiPage.dispose` 只释放登记的释放项（UiNavigator.ts:87）。玩家从品类页返回时若只关页面、fixture 仍 running，会泄漏时钟/输入/订阅。方案：打开入口页时把"退出会话"登记进 `page.addDisposable(...)`，导航关闭页面自然触发会话清理；`lobby.exit` 与宿主 `closeEntryPage` 幂等，避免互调循环（exit 内部先判断 active 再执行）。

### D5：默认入口不依赖固定延时

现有冒烟靠 `setTimeout(1000)` 硬等（AppRoot.ts:211）。默认打开列表页复用 `ensurePageAdapter` 的幂等重试语义：宿主在 `initializeUiRoot` 成功后调用；GRoot 未就绪时经 `smokeUiReady()` 检测并重试（复用既有幂等 init）。

### D6：品类元数据与进入协议签名

```typescript
// assets/game/lobby/catalog.ts —— 纯数据，无 fgui/cc 依赖
export interface GameTypeInfo {
    readonly id: string;
    readonly title: string;
    readonly subtitle?: string;
    readonly icon?: string; // fgui 内图标资源名，可后置
    readonly entry: {
        readonly route: string; // 如 "card/battle"
        readonly packageName: string; // 如 "CardGame"
        readonly resName: string; // 如 "BattleView"
    };
    readonly playable: boolean; // false → 列表项显示"敬请期待"
}
export const gameTypeCatalog: readonly GameTypeInfo[];
```

```typescript
// assets/game/lobby/lobby.ts —— 品类会话编排（引擎无关，宿主注入）
export interface GameLobbyHost {
    readonly provider: IResourceProvider;
    openEntryPage(entry: GameTypeInfo["entry"]): Promise<EntryPageHandle>;
    closeEntryPage(handle: EntryPageHandle): Promise<void>;
}
export interface GameLobby {
    enter(id: string): Promise<GameSession>; // 创建夹具 + start + 打开入口页；重入拒绝
    exit(): Promise<void>; // 关闭页面 + 会话 scope 释放 + 夹具 dispose
    readonly active: GameSession | undefined;
}
```

AppRoot 实现 `GameLobbyHost`，复用 `runCardBattleSmoke` 已验证接缝，把"一次性驱动"改为"持久会话"。

## Risks / Trade-offs

- [夹具 navigator 与真实 UI 脱节] → 明确呈现走宿主侧 + viewModel 钩子，与 `runCardBattleSmoke` 模式一致；不在本 change 内接通。
- [AppRoot 继续堆品类硬编码] → catalog + lobby 把入口协议下沉游戏层；AppRoot 只实现 host + 默认触发。
- [资源释放语义（全量 release）] → 必须用会话 scope（D3），否则退出品类连列表包一起卸载。
- [默认入口打开时机（GRoot 未就绪）] → D5 幂等重试，不靠固定延时。
- [返回键只关页面不退出会话 → 泄漏] → D4 页面作用域登记会话退出；exit/closeEntryPage 幂等防互调循环。
- [五类只有 card 可玩] → catalog 在 D6 定死 playable 标记，不可玩项显示占位而非"进入失败"。

## Migration Plan

无数据迁移。实现顺序：catalog → lobby 纯逻辑（记录型 host 单测）→ AppRoot 宿主接入 + 默认入口 → fgui-designer 建列表页组件 → 移除/收敛 `?smoke=card-battle` 硬编码路径（保留冒烟驱动但仍走 lobby 进入协议或保留原样由既有冒烟测试兜底）。回滚：删除 lobby 模块与默认入口逻辑即可回到 URL 参数驱动。

## Open Questions

- 列表页组件归属：新建独立 FGUI 包（如 `Lobby`）还是放现有 `Demo` 包内——由 fgui-designer 在实现时按包依赖/引用校验决定，不影响本设计。
- 是否保留 `?smoke=card-battle` 冒烟路径原样以兼容既有 headless 验证脚本——实现时确认既有脚本后决定收敛方式，不影响整体方案。
