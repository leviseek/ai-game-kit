# ADR-023 FGUI 编辑器 MCP 桥（双组件 + 文件邮箱主通道）

## 状态

Accepted

## 背景

FGUI 工作流由 `tools/fgui` 确定性 CLI（XML 生成/校验）与编辑器人工操作组成，缺乏「意图 → FGUI 组件 → 客户端产物」的自动化链路，也缺发布后一致性检测。目标是为 FGUI 编辑器实现 MCP（Model Context Protocol）桥，让 AI 代理程序化驱动编辑器完成组件操作、发布触发与产物检测。

## 决策

### 1. 双组件架构：独立进程 MCP server + 编辑器插件

- **MCP server**（`tools/fgui-mcp/`，Node/TS，`McpServer` + `StdioServerTransport`）承载协议编排与工具面。
- **编辑器插件**（`ui/demo/plugins/fgui-mcp-probe/`，TS→Puerts）只做编辑器独有能力（发布配置切换、发布钩子、编辑器级查询），**XML 生成/校验永不迁移进插件**——确定性资产留在 `tools/fgui` CLI。
- 理由：Puerts 宿主隔离/热重载/异常传播策略未知，把协议层放进不可控宿主扩大风险面；独立进程让 MCP 层与 FGUI 层各自可测。备选（插件内嵌 MCP server）被否：MCP stdio 与编辑器 GUI 进程冲突。

### 2. 桥接主通道为文件邮箱（requests/responses JSON 目录）

- MCP 写 `requests/<id>.json`，插件轮询处理写 `responses/<id>.json`；tmp-rename 原子写、响应即读即删。
- 理由：探针实测文件 IO 闭环通过；天然主线程轮询无跨线程风险；实现简单可测。
- HTTP 通道（`HttpListener`）为可选增强：探针已验证回调线程可读编辑器 API，但 `runInBackground` 解决后台问题后必要性降低。

### 3. 发布触发分级：半自动优先，探针验证后开放全自动

- 首期：MCP 全自动做配置切换 + 检测，发布动作留用户点击边界（半自动）。
- `PublishHandler.Run()` 探针验证通过后开放 `fgui_trigger_publish` 全自动（deferred 异步响应，等待 onComplete 返回 isSuccess/exportPath）。
- 发布安全：默认 `redirectToScratch` 重定向到 `.objs`，不触碰真实 `assets/ui` 产物。

### 4. 一致性检测用三重增量证据，不解析 bin

- 发布信号（插件 `onPublishEnd` 写的 `publish-signal.json`，新鲜度 <2min）+ 产物 mtime ≥ 源最新 + `bun run fgui validate --strict`。任一缺失判定失败并返回差异明细。

### 5. 编辑器后台轮询用 `runInBackground`，不用后台线程

- Unity 默认窗口失焦/后台暂停主循环 → 插件 `add_onUpdate`/`Timers` 停摆 → 邮箱轮询停。解法：`CS.UnityEngine.Application.runInBackground = true`（启动 + 每个 tick 驱动内持续重置，因 F5/预览会覆盖该标志）。
- **反模式（实测否决）**：后台线程驱动 JS 轮询（setTimeout、HttpListener 自驱动链）——setTimeout 随主循环停摆；HttpListener 回调线程访问 JS 闭包触发 Puerts 未定义行为导致编辑器闪退。Puerts 单线程运行时，后台线程与 JS 状态不互通。

### 6. 插件幂等与对称清理

- 插件会被编辑器重复求值/刷新：菜单注册幂等（先 Remove 再 Add）、初始化用文件锁（`FileMode.CreateNew` 原子独占）、`stopMailboxServer` 对称移除 add_onUpdate/Timers 驱动。刷新插件为干净重启，单 server 实例。

## 理由

- 文件邮箱主通道复用探针验证过的确定性路径，与 `tools/fgui` CLI 交叉验证一致（39 项资源比对归一化后全绿）。
- 三重证据检测避免解析 bin 二进制（成本高），用增量证据（mtime + 信号 + validate）在可接受置信度上判定一致。
- `runInBackground` 是 Unity 原生开关，几行代码解决后台轮询，避免线程模型冒险。

## 影响

- 新增 `tools/fgui-mcp/`（server）与 `ui/demo/plugins/fgui-mcp-probe/`（插件），不改变 `tools/fgui` 行为。
- 发布产物仍由 FGUI 编辑器发布生成，检测链路只读校验。
- 回滚即删除上述两目录，现有确定性工作流零影响。
