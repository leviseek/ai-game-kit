## 1. 品类元数据表（catalog）

- [x] 1.1 新增 `assets/game/lobby/catalog.ts`：定义 `GameTypeInfo` 接口（id/title/subtitle/icon/entry{route,packageName,resName}/playable）与 `gameTypeCatalog` 显式清单；card 可玩（CardGame/BattleView），fight/idle/rpg/tycoon 不可玩；文件无 fgui/cc 导入
- [x] 1.2 新增 `tests/framework/foundation/game-lobby-catalog.test.ts`：断言 catalog 每项 id 与 `gameFixtureRegistry` 对齐、card 入口 package/resName 与 `runCardBattleSmoke` 冒烟一致、不可玩项无真实入口

## 2. 品类会话编排（lobby 纯逻辑）

- [x] 2.1 新增 `assets/game/lobby/lobby.ts`：定义 `GameLobbyHost`（openEntryPage/closeEntryPage，宿主注入）与 `GameSession` 接口
- [x] 2.2 实现 `createGameLobby(host)`：`enter(id)` 按 catalog 元数据创建品类夹具（经 `gameFixtureRegistry`）→ `fixture.start()` → `host.openEntryPage(entry)`；单会话，已有 `active` 时重入返回拒绝
- [x] 2.3 实现 `exit()`：`host.closeEntryPage(handle)` → 会话资源 scope 释放 → `fixture.dispose()`；重复退出幂等；页面作用域登记"退出会话"disposable，使导航关闭页面自然触发会话清理，且 `lobby.exit` 与 `closeEntryPage` 不互调循环
- [x] 2.4 新增 `tests/framework/foundation/game-lobby.test.ts`：记录型 host 驱动，断言 enter 按序（fixture.start → openEntryPage）、exit 按序（closeEntryPage → scope release → dispose）、重入拒绝、重复退出幂等

## 3. AppRoot 宿主接入 + 默认入口

- [x] 3.1 AppRoot 实现 `GameLobbyHost`：会话 scope 持有品类 package（retain）、`pageAdapter.createPage/mount`、`FairyGuiViewHandle` + ViewModelRenderer 装配，复用 `runCardBattleSmoke` 已验证接缝（assets/boot/AppRoot.ts:674）
- [x] 3.2 AppRoot 无 URL 参数时默认打开列表页；GRoot 未就绪时经 `smokeUiReady()` 检测并幂等重试，不依赖固定 `setTimeout` 延时
- [x] 3.3 收敛 `?smoke=card-battle` 硬编码路径：确认既有 headless 验证脚本依赖后，改为经 lobby 进入协议驱动（或保留原样由既有冒烟测试兜底），消除 AppRoot 品类硬编码分支
- [x] 3.4 更新 AppRoot 冒烟测试/验证：无参启动见列表页，进入 card 可玩对战、返回列表后品类包可卸载（`smokeCanUnload("ui")` 语义成立）、列表包保留

## 4. FGUI 列表页组件

- [x] 4.1 委派 fgui-designer 创建列表页组件（新包或 Demo 包内，按包依赖/引用校验决定）：列表项渲染 + 点击回调；纯色视觉用 `bun run fgui sprite` 生成像素图并以 `<image>` 引用，禁止 `<graph>` 节点
- [x] 4.2 产出 XML 后运行 `bun run fgui validate --strict` 到通过，并在 FGUI 编辑器中刷新目标组件确认可读取
- [x] 4.3 AppRoot/宿主把列表页点击回调接到 `lobby.enter(id)`；不可玩项显示占位/禁用，不发起进入请求

## 5. 收口验证

- [x] 5.1 运行 `bun run typecheck`、`bun run test:foundation` 全部通过；新增测试覆盖 catalog/lobby 用例
- [x] 5.2 全量格式化（对齐 4 空格缩进）与 lint 检查通过，无未使用/风格漂移
- [x] 5.3 提交前检查 ADR：本 change 是否产生新的架构决策（如"跨品类大厅编排归属游戏层、呈现走宿主侧"）；如有，按 `doc/decisions/ADR-NNN-<slug>.md` 约定创建 ADR 并编号续接 ADR-019；如无，明确记录无需 ADR
