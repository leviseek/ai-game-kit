## Context

动机见 proposal.md - Why。当前工程约束：`tools/fgui` 确定性 CLI 是 XML 生成/校验的权威执行层（有测试）；发布产物必须由 FGUI 编辑器发布生成（AGENTS.md 第 14 条）；已验证的编辑器插件 API 证据集中在 `D:\ai-work\fgui-agent` 知识库、`D:\git-clone\fguiPlugin`、`D:\git-clone\future_lab\fgui_lab\plugins\ToolPlugin` 与 `D:\git-clone\XIHFrameWork`（onPublish 钩子触发、`GlobalPublishSettings` 程序化写入与 `allPackages.Open()` 刷新、`GetPackageByName`/`items`/`DependencyQuery` 遍历均为真实源码证实）。

**阶段 0 实机探针结论（已收敛）**：
- `pkg.Open()` 对已打开包幂等安全、6 包 15ms、编辑区闪烁"是"、无其它副作用——阶段 2 配置切换链路获实机背书。
- 文件邮箱模式（插件内 `File.WriteAllText/ReadAllText`）读写闭环通过——桥接兜底通道成立。
- `PublishHandler.Run()` **复测通过**：空 branch（`activeBranch:""`）构造合法、`Run()` 同步返回 299ms、`onComplete`/`isSuccess` 触发、**`onPublish` 钩子随 Run() 触发**（`onPublishHookFired=true`）、`allBranches=[]`。硬编码分支名抛 `Branch not exists`——branch 不是自由字符串，禁止硬编码。
- HttpListener **复测通过**：端口扫描取空闲端口后 `Start()` 成功、`WebClient.DownloadString` 闭环成功、**回调线程可安全读取编辑器 API**（`callbackEditorApiTouch="ok:demo"`，未抛跨线程异常）。
- insert-object **v2 复测通过**：数据真实进入目标文档（`beforeChildren=2→afterChildren=3`、`appActiveSame=true`、`opDocIsAppActive=true`）、编辑区人工可见——组件插入 MCP 工具可开放。`OpenDocument(url, true)` 在本工程同步激活成功，无需强制 setter（探针保留了 `docView.activeDoc = doc` 兜底与引用相等性校验）。

## Goals / Non-Goals

**Goals:**
- 独立进程 MCP server + 编辑器插件双组件架构，打通「意图 → FGUI 组件 → 客户端产物」链路
- 编辑器插件只做编辑器独有能力（发布配置切换、发布钩子、编辑器级查询），XML 生成/校验永不迁移进插件
- 发布配置切换与产物检测全自动；发布动作首期半自动，探针收敛后开放全自动
- 复用已验证插件源码片段，把确定性最高段直接抄（`MenuMain_Publish` 配置链路、插件骨架、邮箱通知）

**Non-Goals:**
- 不解析 bin 二进制内容做字节级比对（用三重增量证据替代）
- 首期不做无 UI 的 batch mode 全自动发布（batchMode 行为未知）
- 不改变 `tools/fgui` CLI 现有行为；不引入第三方运行时依赖（MCP SDK 仅 devDependency）

## Decisions

### 1. MCP server 放独立 Node 进程，编辑器插件只做操作层

MCP server（`tools/fgui-mcp/`，标准 MCP SDK，devDependency）承载协议编排；编辑器插件（TS→Puerts）暴露操作端点。理由：Puerts 宿主隔离/热重载/异常传播策略未知（知识库 `05-plugin-system.md`），把协议层放进不可控宿主扩大风险面；独立进程让 MCP 层与 FGUI 层各自可测。备选（插件内嵌 MCP server）被否：MCP stdio 与编辑器 GUI 进程冲突、生命周期清理复杂。

### 2. 桥接：文件邮箱为主通道（实测通过），HTTP 为可选增强

- **主通道（阶段 1 落地）：文件邮箱模式**——MCP 写 `requests/*.json`，插件每帧轮询处理写 `responses/*.json`。实测闭环通过；天然主线程轮询，无跨线程调用编辑器 API 的风险；实现简单、可测。
- **可选增强（阶段 4 前）：HTTP 通道**——插件内嵌 `System.Net.HttpListener` 绑定 `127.0.0.1` + 显式端口（经 `TcpListener`/端口扫描取空闲端口，**不可用端口 0**），端口/token 写入工程目录握手文件（如 `.fgui-mcp.json`）。阶段 0 已证明绑定链路可用，但回调线程模型待复测；复测通过后可作为主通道候选。
- 握手：端口（若启用 HTTP）/token 写入工程 `.objs/fgui-mcp-probe/` 或工程根握手文件，MCP server 启动时读取。

### 3. 发布配置切换直接复用 `MenuMain_Publish` 已验证链路

`GlobalPublishSettings` 字段（path/fileExtension/binaryFormat/atlasSetting 等）程序化写入 → `Save()` → `project.type` → `project.Save()` → `allPackages.ForEach(v => v.Open())` 刷新包设置；跳过只读 `fileName`；切换前快照、提供回滚。这段是全报告确定性最高可抄段（证据：`MenuMain_Publish.ts:116-143`；`pkg.Open()` 实测幂等 17ms）。

### 4. 发布触发分级：半自动优先，Run() 复测通过后开放全自动

- 首期：MCP 全自动做配置切换 + 检测，发布动作留在用户点击边界。
- 检测：三重证据——`onPublishEnd` 邮箱通知（含包列表/时间戳）、`isSuccess`（`editor.d.ts:19224`）、外部 `bun run fgui validate --strict` + 产物 mtime/hash 新鲜度。
- 全自动：`PublishHandler.Run()` **复测已通过**（空 branch 构造合法、同步返回、onComplete/isSuccess/onPublish 钩子全部触发）——阶段 4 开放条件已具备；建议实现前实测一次大包发布确认主线程阻塞表现（小包 299ms 未能完全暴露阻塞影响）。
- **分支处理**：发布/分支相关工具参数中 branch 为可选，默认取 `project.activeBranch`（允许空串 = 主干/无分支），合法值由 `allBranches` 动态生成，**禁止硬编码分支名**。

### 5. 一致性检测不解析 bin，用增量证据

发布前记录源 XML/PNG 状态（git status/mtime/hash）→ 发布后 `validate --strict` 全绿 + 产物 mtime 新鲜 + 编辑器发布信号，三者同时满足视为产物与源一致；失败返回差异明细。备选的"源 XML → 期望产物哈希"回归基准仅作后期优化。

### 6. 组件插入走证据充分的 API 路线（v2：显式激活 + 数据取证）

- item 查找用 `FindItemByName`/`items` 遍历（有真实证据）；`GetItemByPath` 实机语义已收敛为 `"/DemoView"`（前导斜杠 + 无扩展名）。
- 插入流程（与 fguiPlugin `EditorUtils.AddComponent` 语义对齐，并吸收探针"前台未激活"教训）：
  1. `FindItemByName` → `item.GetURL()`
  2. `doc = App.docView.OpenDocument(url, true)`
  3. **强制激活**：`if (App.docView.activeDoc !== doc) App.docView.activeDoc = doc`（必要时 `Timers.CallLater` 等一帧）
  4. 操作对象用 `App.activeDoc || doc`（与真实插件一致）
  5. `op.UnselectAll()` → `op.InsertObject(url, pos?, index?)` → `op.SetModified(true)`
  6. 数据验证：`content.children` 增量 / `Serialize()` XML 是否含 src
- **关键约束**：插入后必须校验 `App.activeDoc === 操作对象` 的引用相等性，否则插入落在非前台文档（探针 v1 实测陷阱）；可见性在插件侧无法自动断言，MCP 返回需带 activeDoc 状态与可见性提示。
- 安全约束：探针在可丢弃文档上执行并延迟 `DiscardChanges` 恢复。

## Risks / Trade-offs

- [PublishHandler.Run() 全自动发布可能阻塞主线程（小包 299ms 已同步返回，大包影响未实测）] → 阶段 4 实现前实测一次大包发布；若阻塞明显，全自动工具需提示"发布期间编辑器卡顿"。
- [HttpListener 回调线程可读只读编辑器 API，但写操作/复杂调用线程安全未验证] → 文件邮箱为主通道天然规避；HTTP 作为增强，写操作仍走主线程。
- [activeDoc.InsertObject 插入可能落在非前台文档（探针 v1 实测陷阱）] → 已复测：本工程 `OpenDocument(url, true)` 同步激活，`App.activeDoc === 操作对象` 成立；实现时仍保留引用相等性校验与 `docView.activeDoc = doc` 兜底，规避跨版本激活语义差异。
- [工程为无分支形态，branch 空串发布已实测合法] → MCP 工具显式支持空分支（发布到主干）。
- [pkg.Open() 刷新会让编辑区闪烁（实测确认"是"）] → 工具返回中显式提示副作用。
- [插件崩溃可能拖累编辑器] → 插件代码最小化、只做确定性操作；MCP 方案失败不影响现有 `tools/fgui` 工作流。

## Migration Plan

1. 阶段 0：探针插件验证未知区——`pkg.Open()`、文件邮箱、`PublishHandler.Run()`、HttpListener、insert-object **全部实测通过**（见 `ui/demo/plugins/fgui-mcp-probe/docs/probe-results.md`），未知区清单收敛完毕。
2. 阶段 1：MCP server 骨架 + 读工具（包/资源/依赖/发布配置/活动文档），主桥接通道为文件邮箱，与 `tools/fgui` CLI 输出交叉验证。
3. 阶段 2：写工具——发布配置切换（复用 `MenuMain_Publish` 链路）+ 组件插入（v2 复测通过后，按决策 6 固化）。
4. 阶段 3：半自动发布闭环（改源 → 配置切换 → 用户点击发布 → 邮箱检测 → validate）。
5. 阶段 4（可选）：`Run()` 复测通过、HttpListener 增强通道就绪后开放全自动发布。
回滚：新组件全部独立于 `tools/fgui` 与运行时，回滚即删除 `tools/fgui-mcp/` 与插件目录，现有确定性工作流零影响。
