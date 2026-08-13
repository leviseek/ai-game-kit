# ADR-033: Architecture Visualizer Fact Sources

## Status

Accepted

## Context

架构可视化工作台需要同时回答符号调用、影响范围、模块依赖、层次归属和源码证据。CodeGraph 公共 CLI 已能提供符号、caller/callee、impact 和索引状态，但不暴露稳定的全量 import/export 依赖边，也不保证覆盖文件内所有声明的层次结构。

工作台还需要在本地源码变化后把新快照推给页面。该通道只需要服务端通知浏览器刷新只读快照，不需要浏览器向服务端发送协作编辑或查询命令。

## Decision

架构可视化工作台采用两个事实源：

- CodeGraph 公共 CLI 是符号调用、caller/callee、impact、索引状态和符号解析的事实源；工具只调用 `sync --quiet` 与 JSON API，不读取私有 SQLite。
- `SourceScanner` 使用 TypeScript Compiler API 扫描当前仓库源码，作为静态 `import/export` 关系、声明名称/kind 和源码位置的事实源；它不推断函数调用。

本地工作台使用 HTTP + Server-Sent Events（SSE）。HTTP 提供静态资源、快照查询、搜索和 source allowlist 后的源码片段；SSE 只广播 `state-changed`、`snapshot-ready`、`error`，页面收到后重新读取完整快照。

## Consequences

- CodeGraph 与 `SourceScanner` 的边界必须在实现和测试中保持清晰，避免把静态 import/export 当作调用事实。
- CodeGraph 未安装、缺少索引、pendingChanges 非零或 worktree mismatch 时必须明确失败，不自动初始化或修复索引。
- 分析失败时保留最后一次成功快照，SSE 只传递状态事件，不承载完整图数据。
- 未来若增加 MCP、WebSocket 或远程协作能力，必须另开 ADR 评估双向通道和安全边界。
