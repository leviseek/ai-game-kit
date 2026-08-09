## Context

动机见 proposal.md - Why。当前工程约束：`tools/fgui` 确定性 CLI 是 XML 生成/校验的权威执行层（有测试）；发布产物必须由 FGUI 编辑器发布生成（AGENTS.md 第 14 条）；已验证的编辑器插件 API 证据集中在 `D:\ai-work\fgui-agent` 知识库、`D:\git-clone\fguiPlugin`、`D:\git-clone\future_lab\fgui_lab\plugins\ToolPlugin` 与 `D:\git-clone\XIHFrameWork`（onPublish 钩子触发、`GlobalPublishSettings` 程序化写入与 `allPackages.Open()` 刷新、`GetPackageByName`/`items`/`DependencyQuery` 遍历均为真实源码证实）。未知区：`PublishHandler.Run()` 实机行为、HttpListener 线程模型、`activeDoc.InsertObject` 实机行为（示例中调用点被注释）。

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

MCP server（`tools/fgui-mcp/`，标准 MCP SDK，devDependency）承载协议编排；编辑器插件（TS→Puerts）内嵌 HttpListener 暴露本地 HTTP 端点。理由：Puerts 宿主隔离/热重载/异常传播策略未知（知识库 `05-plugin-system.md`），把协议层放进不可控宿主扩大风险面；独立进程让 MCP 层与 FGUI 层各自可测。备选（插件内嵌 MCP server）被否：MCP stdio 与编辑器 GUI 进程冲突、生命周期清理复杂。

### 2. 桥接：本地 HTTP + 握手文件，备选文件邮箱

- 主通道：插件内嵌 `System.Net.HttpListener` 绑定 `127.0.0.1` + 随机端口，端口/token 写入工程目录握手文件（如 `.fgui-mcp.json`），MCP server 启动时读取；JSON-RPC 风格最小协议 `{ id, method, params }`，插件只暴露 3-4 个动作端点（`/ping`、`/refresh`、`/publish`、`/query`）。
- 备选/兜底：文件邮箱模式（MCP 写 `requests/*.json`，插件每帧轮询处理写 `responses/*.json`），不依赖网络栈在宿主中的真实行为。阶段 0 探针两个都试，谁稳用谁。

### 3. 发布配置切换直接复用 `MenuMain_Publish` 已验证链路

`GlobalPublishSettings` 字段（path/fileExtension/binaryFormat/atlasSetting 等）程序化写入 → `Save()` → `project.type` → `project.Save()` → `allPackages.ForEach(v => v.Open())` 刷新包设置；跳过只读 `fileName`；切换前快照、提供回滚。这段是全报告确定性最高可抄段（证据：`MenuMain_Publish.ts:116-143`）。

### 4. 发布触发分级：半自动优先，Run() 探针后开放

- 首期：MCP 全自动做配置切换 + 检测，发布动作留在用户点击边界。
- 检测：三重证据——`onPublishEnd` 邮箱通知（含包列表/时间戳）、`isSuccess`（`editor.d.ts:19224`）、外部 `bun run fgui validate --strict` + 产物 mtime/hash 新鲜度。
- 后期：`PublishHandler.Run()`（`editor.d.ts:19253`）经阶段 0 探针验证（主线程、`onComplete` 时序、是否递归触发 onPublish、错误契约）后开放全自动工具。

### 5. 一致性检测不解析 bin，用增量证据

发布前记录源 XML/PNG 状态（git status/mtime/hash）→ 发布后 `validate --strict` 全绿 + 产物 mtime 新鲜 + 编辑器发布信号，三者同时满足视为产物与源一致；失败返回差异明细。备选的"源 XML → 期望产物哈希"回归基准仅作后期优化。

## Risks / Trade-offs

- [PublishHandler.Run() 无实战证据，全自动发布可能双触发或阻塞主线程] → 阶段 0 探针先行；探针未通过前工具面不开放全自动发布，半自动闭环不受影响。
- [HttpListener 在 Puerts 下线程模型未知，回调可能不在主线程，跨线程调用编辑器 API 不安全] → 探针验证；失败则回退文件邮箱模式。
- [activeDoc.InsertObject 实机行为未知（示例调用点被注释）] → 组件插入工具标记为低确定性，探针验证后才开放写操作。
- [pkg.Open() 刷新会让编辑区闪烁（作者注释）] → 工具返回中显式提示副作用。
- [插件崩溃可能拖累编辑器] → 插件代码最小化、只做确定性操作；MCP 方案失败不影响现有 `tools/fgui` 工作流。

## Migration Plan

1. 阶段 0：探针插件（基于三例同构骨架）验证四个未知区，输出结论文档。
2. 阶段 1：MCP server 骨架 + 读工具（包/资源/依赖/发布配置/活动文档），与 `tools/fgui` CLI 输出交叉验证。
3. 阶段 2：写工具——发布配置切换（复用 `MenuMain_Publish` 链路）+ 组件插入（探针通过后）。
4. 阶段 3：半自动发布闭环（改源 → 配置切换 → 用户点击发布 → 邮箱检测 → validate）。
5. 阶段 4（可选）：探针通过后开放全自动发布。
回滚：新组件全部独立于 `tools/fgui` 与运行时，回滚即删除 `tools/fgui-mcp/` 与插件目录，现有确定性工作流零影响。
