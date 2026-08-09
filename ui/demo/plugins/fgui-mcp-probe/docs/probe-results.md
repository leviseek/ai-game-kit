# 阶段 0 实机探针结果

> 用途：记录 `ui/demo/plugins/fgui-mcp-probe` 插件在目标 FGUI 编辑器版本上的实测结论，收敛未知区清单。
> 原始数据由插件写入 `ui/demo/.objs/fgui-mcp-probe/probe-results.json`（gitignored），本文件用于沉淀人工观察与结论。

## 首轮实测结论（2026-08-09）

**已确认**：`pkg.Open()` 幂等、6 包 17ms、编辑区闪烁"是"；文件邮箱读写闭环通过。

**三个探针缺陷已修复，需复测**：
- `publish-handler`：原代码 `branch = activeBranch || "master"` 在无分支工程抛 `Branch not exists: master`。已改为：先传 `activeBranch` 原值（空串），失败再测无参构造 `new PublishHandler()`；记录 `allBranches` 与构造策略。
- `http-listener`：原代码用端口 0（HttpListener 不支持）抛 `Invalid port`。已改为端口扫描取空闲端口 + `BeginGetContext` 回调 + `WebClient.DownloadString` 闭环，并记录回调线程触碰编辑器 API 的成败。
- `insert-object`：原代码 `GetItemByPath("/DemoView.xml")` 返回 null。已改为 `FindItemByName` 主路线，`GetItemByPath` 各候选形态作为附属探测记录。

## 复测结论（2026-08-09，全部通过）

| 探针 | 结果 | 关键证据 |
| --- | --- | --- |
| publish-handler | ✅ pass | `isSuccess=true`、`elapsedMs=299`、`runReturnedSync=true`、`onCompleteFired=true`、`onPublishHookFired=true`、`ctorMode=activeBranch:""`（**空 branch 合法**）、`allBranches=[]` |
| http-listener | ✅ pass | `isListening=true`、`port=61266`、`roundTrip=""`（HTTP 200 闭环）、**`callbackEditorApiTouch="ok:demo"`（回调线程可安全读取编辑器 API）** |
| insert-object | ⚠️ pass 但**编辑区不可见** | `returnedObject=true`、`isModified=true`、`elapsedMs=1`、`activeDocChanged=false`；`pathResults`：`/DemoView`（带根、无扩展名）=true，其余形态 false |
| file-mailbox | ✅ pass | 读写闭环通过 |
| pkg-open | ✅ pass | 6 包 15ms、无错误、编辑区闪烁"是" |

**重大新证据**：
- `PublishHandler.Run()` 在空 branch（`activeBranch:""`）下构造成功并完成发布（299ms 同步返回、onComplete 触发、isSuccess=true），且 **onPublish 钩子随 Run() 触发**。
- HttpListener 回调线程能读取 `App.project.name`（`ok:demo`），未抛跨线程异常——HTTP 通道可行性显著提升。
- `GetItemByPath` 真实语义收敛：`"/DemoView"`（前导斜杠 + 无扩展名）返回 true。
- **待解问题**：insert-object 插入成功且 `isModified=true`，但 `activeDocChanged=false`，且人工观察编辑区不可见——插入落在了某个文档上，但未成为前台编辑文档。

## 运行方法

1. 确认已安装并打开目标版本 FairyGUI 编辑器（工程 `ui/demo/demo.fairy`，类型 CocosCreator）。
2. 将 `ui/demo/plugins/fgui-mcp-probe` 目录放入编辑器项目插件目录（项目下 `plugins/`，与 `demo.fairy` 同级）。
3. 重新打开工程，插件自动加载，顶部菜单出现「工具 > FGUI MCP 探针」。
4. 建议先点「环境快照」，再逐项执行探针；发布类探针会把产物重定向到 `.objs/fgui-mcp-probe/publish-out/`，不会触碰真实 `assets/ui`。
5. 编辑结果文件 `.objs/fgui-mcp-probe/probe-results.json` 记录到下表，补充人工观察。

## 环境信息（探针 env）

| 项         | 值           |
| ---------- | ------------ |
| 编辑器版本 | /            |
| 工程类型   | CocosCreator |
| 活动分支   | 无           |
| 包清单     |              |

## 探针结论

### A. activeDoc.InsertObject（探针 insert-object）

**v1 结果（已废弃）**：`returnedObject=true`、`isModified=true`、`activeDocChanged=false`、编辑区不可见。根因：插入发生在「已打开但未前台激活」的文档实例上，且探针 DiscardChanges 自我回滚。

**v2 已通过（2026-08-09）**：人工观察编辑区可见 StartButton。

| 观察项 | v2 结果 |
| --- | --- |
| 插入返回对象 | true |
| 是否自动 SetModified | true |
| docMatchesTarget | true（doc 即目标文档） |
| appActiveSame / docViewActiveSame | true / true（`App.activeDoc` 与 `docView.activeDoc` 指向同一文档） |
| forcedActive | false（无需强制激活，OpenDocument 已激活） |
| opDocIsAppActive | true（操作对象即前台文档） |
| 数据是否真进入文档 | **是**：beforeChildren=2 → afterChildren=3 |
| 插入是否在编辑区可见 | **是**（人工确认） |
| 探针记录（probe-results.json） | pass |

注：`serializeHasInsert=false` 为探针 XML 取证假设与实际结构不符所致（src 引用形态/元素名差异），不影响结论——children 增量 + 人工可见已足证插入成功。

结论：**组件插入 MCP 工具可开放**，实现按 design.md 决策 6（`FindItemByName` → `OpenDocument` → 校验 activeDoc 引用 → `InsertObject` → `SetModified`）。

### B. PublishHandler.Run()（探针 publish-handler）

**v1 结果（已废弃）**：`Branch not exists: master`。**v2 已通过**：`activeBranch:""` 空 branch 构造成功、`Run()` 同步返回、`elapsedMs=299`、`onCompleteFired=true`、`isSuccess=true`、**`onPublishHookFired=true`（onPublish 钩子随 Run() 触发）**、`allBranches=[]`。

| 观察项 | v2 结果 |
| --- | --- |
| Run() 是否同步返回（耗时） | 是，299ms |
| 是否阻塞编辑器主线程 | 需人工确认（发布小包耗时短） |
| onComplete 是否触发 | 是 |
| isSuccess 时序与最终值 | true |
| onPublish 钩子是否随 Run() 触发 | 是（交叉验证点达成） |
| 异常/错误契约 | 空 branch 合法；硬编码分支名抛 Branch not exists |
| 探针记录（probe-results.json） | pass |

结论（决定阶段 4 是否开放全自动发布工具）：**Run() 链路验证通过，阶段 4 开放条件已具备；但仍建议实测一次大包发布确认主线程阻塞表现**。

### C. HttpListener（探针 http-listener）

**v1 结果（已废弃）**：端口 0 抛 `Invalid port`。**v2 已通过**：端口扫描取空闲端口、`isListening=true`、`roundTrip=""`（HTTP 200 空响应闭环成功）、**`callbackEditorApiTouch="ok:demo"`（回调线程可安全读取编辑器 API，未抛跨线程异常）**。

| 观察项 | v2 结果 |
| --- | --- |
| Start() 是否成功 | 是（port 61266） |
| 是否能响应请求 | 是（roundTrip 闭环） |
| 回调线程能否安全调用编辑器 API | 是（读取 project.name 成功） |
| 探针记录（probe-results.json） | pass |

结论（决定主桥接通道是否选 HTTP，否则回退文件邮箱）：**HTTP 通道可行性大幅提升，回调线程触碰只读编辑器 API 无异常；文件邮箱仍为主通道（更稳），HTTP 可作为阶段 4 前增强**。

### D. 文件邮箱模式（探针 file-mailbox）

| 观察项 | 结果 |
| --- | --- |
| 读写闭环 | 成功 |
| 探针记录（probe-results.json） | pass |

### E. pkg.Open() 刷新包设置（探针 pkg-open）

| 观察项 | 结果 |
| --- | --- |
| 遍历耗时 | 15ms |
| 编辑区是否闪烁 | 是 |
| 是否有其它副作用 | 无 |
| 探针记录（probe-results.json） | pass |

## 未知区清单（收敛后）

- [x] PublishHandler.Run() 行为已确认（空 branch 合法、同步返回、onComplete/isSuccess/onPublish 钩子全部触发）→ 阶段 4 全自动发布 可（建议实测大包主线程阻塞）
- [x] HttpListener 已确认（Start/响应/回调线程可读编辑器 API）→ 文件邮箱仍为主通道，HTTP 为增强
- [x] InsertObject 已确认（数据真实进入文档：children 2→3；人工可见）→ 组件插入 MCP 工具 可开放
- [x] pkg.Open() 副作用已确认（幂等 15ms、编辑区闪烁）→ 配置切换返回中提示项确认

## 后续决策依据

将本文件结论回填到 `openspec/changes/fgui-mcp-editor-bridge/design.md` 的未知区与阶段 4 判定。

## 已知平台约束（重要）

**FairyGUI 编辑器（Unity 内核）窗口失焦/后台时会暂停主循环。** 插件侧 `add_onUpdate` 与 `Timers.inst` 均由编辑器主循环驱动，窗口在后台时均不触发 → 邮箱服务器不轮询 → MCP 请求超时「编辑器桥不可达」。

- 现象：cross-verify 在编辑器前台时稳定可达；鼠标焦点切到 VSCode 等其它窗口后，编辑器后台停帧，请求无人响应。
- 这不是插件 bug，而是平台行为。**调用 MCP 工具前需保持 FairyGUI 编辑器窗口前台。**
- 对阶段 4 的影响：若需全自动/无人值守，文件邮箱主通道受此约束；HTTP 通道（回调线程不依赖主循环）可能是更优解，需在阶段 4 复测其后台可用性。
