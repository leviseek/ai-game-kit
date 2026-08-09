## Purpose

为 FGUI 编辑器提供 MCP（Model Context Protocol）桥能力：独立进程的 MCP server 经本地桥接层驱动编辑器插件，向 AI 代理暴露包/资源查询、发布配置切换、发布触发与产物一致性检测的确定性工具面，同时保持 `tools/fgui` CLI 作为 XML 生成与校验的权威执行层，打通「意图 → FGUI 组件 → 客户端产物」链路。

## ADDED Requirements

### Requirement: MCP server exposes a deterministic tool surface over the editor bridge

MCP server MUST 经本地桥接层与 FGUI 编辑器插件通信，并向 AI 代理暴露四类确定性工具：查询（包/资源/依赖/发布配置/活动文档）、写（发布配置切换、组件插入）、发布触发（按确定性分级开放）、检测（产物与源一致性）。每个工具 MUST 返回结构化结果，失败 MUST 返回明确错误而非静默。查询与检测类工具 MUST 具备高确定性——其结果与 `tools/fgui` CLI 的 `list-resources`/`validate` 输出一致。

#### Scenario: Agent queries package and resource inventory through the bridge
- **WHEN** AI 代理经 MCP server 请求列出当前工程包与某包资源
- **THEN** 返回包列表、每包资源的 id/类型/路径/导出标记，且与 `tools/fgui list-resources` 结果一致

#### Scenario: A failed tool call returns a structured error
- **WHEN** AI 代理调用某个 MCP 工具且编辑器侧不可达或操作失败
- **THEN** 返回结构化错误（含桥接状态、失败原因），且不中断后续调用

#### Scenario: XML generation and validation remain the CLI's authority
- **WHEN** AI 代理需要创建或校验 FGUI 组件源 XML
- **THEN** MCP server 将该请求透传给 `tools/fgui` CLI 执行，MCP 自身不实现 XML 生成或校验逻辑

### Requirement: Publish configuration can be switched programmatically and restored

MCP 桥 MUST 支持程序化切换发布目标（路径、fileExtension、binaryFormat、atlasSetting 等 `GlobalPublishSettings` 字段）并持久化。切换前 MUST 快照原配置，MUST 提供回滚能力。切换结果 MUST 在返回中提示编辑器副作用（如包设置刷新引起的编辑区闪烁）。只读字段（如 `fileName`）MUST 不被覆写。

#### Scenario: Switch publish target to client output path
- **WHEN** AI 代理请求切换到某发布目标预设（含目标路径与 bin/atlas 格式）
- **THEN** 全局发布设置被写入并保存，包设置被刷新，返回确认与副作用提示

#### Scenario: Restore previously snapshotted publish settings
- **WHEN** AI 代理在切换后请求回滚
- **THEN** 发布配置恢复为切换前快照，且只读字段保持原值

### Requirement: Publish result detection verifies artifacts against sources

MCP 桥 MUST 在发布后检测产物与源的一致性，判定依据为三重证据：编辑器发布信号（`onPublishEnd` 邮箱通知、`isSuccess`）、产物新鲜度（bin/atlas 的 mtime 不早于全部相关源 XML/PNG）、`tools/fgui validate --strict` 通过。任一证据缺失 MUST 判定失败并返回差异明细，不得静默通过。

#### Scenario: Publish succeeds and artifacts match sources
- **WHEN** 用户在编辑器发布后 AI 代理请求校验
- **THEN** 三证据齐备且 validate 通过时，返回"产物与源一致"及发布详情

#### Scenario: Stale artifacts are flagged
- **WHEN** 某 bin 的 mtime 早于对应源 XML，或 `onPublishEnd` 邮箱信号缺失
- **THEN** 返回失败，并列出具体失配包与差异项

### Requirement: Publish triggering is gated by verified determinism

发布触发能力 MUST 按确定性分级开放：配置切换与检测全自动；发布动作默认保留人工边界（用户点击触发，桥负责检测），仅当 `PublishHandler.Run()` 的实机行为（主线程、回调时序、错误契约）经探针验证后才开放全自动发布工具。

#### Scenario: Semi-automatic publish with automated detection
- **WHEN** 配置已由桥切换，用户在编辑器点击发布
- **THEN** 桥自动捕获发布信号并执行产物一致性检测，返回校验结果

#### Scenario: Full-auto publish stays disabled until probed
- **WHEN** `PublishHandler.Run()` 探针未通过验证
- **THEN** MCP 工具面不暴露全自动发布工具，或显式标记为实验性并禁止在默认流程中使用
