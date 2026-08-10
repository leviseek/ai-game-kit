# fgui-editor-mcp-bridge Specification

## Purpose

为 FGUI 编辑器提供 MCP（Model Context Protocol）桥能力：独立进程的 MCP server 经本地桥接层驱动编辑器插件，向 AI 代理暴露包/资源查询、发布配置切换、发布触发与产物一致性检测的确定性工具面，同时保持 `tools/fgui` CLI 作为 XML 生成与校验的权威执行层，打通「意图 → FGUI 组件 → 客户端产物」链路。

## Requirements

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

### Requirement: Document lifecycle is closed by a save tool

MCP server MUST expose `fgui_save_documents`（保存活动文档或全部未保存文档），供写操作后持久化内存态修改。在触发发布前，MCP server MUST 先执行保存，保证内存与磁盘 XML 一致。保存失败 MUST 返回结构化错误并中止发布流程。

#### Scenario: Save active document after structural edit
- **WHEN** AI 调用了 `fgui_add_child`/`fgui_set_object_property` 等写工具后调用 `fgui_save_documents` 保存活动文档
- **THEN** 活动文档的未保存修改被写入磁盘 XML，返回已保存文档列表；编辑器文档状态不再标记为 modified

#### Scenario: Publish flow forces a save before running
- **WHEN** AI 触发发布（`fgui_trigger_publish`）且存在未保存文档
- **THEN** MCP server 先保存全部未保存文档，再启动发布；若保存失败则发布不执行并返回错误

### Requirement: External resources can be imported into a package

MCP server MUST expose `fgui_import_resource`（把外部文件，如 `tools/fgui sprite` 生成的 PNG，导入包内并登记为资源）。导入使用 `ResourceImportQueue` 语义（批量排队、逐项处理），成功后返回新资源的 id/名称/路径；失败 MUST 返回结构化错误并说明失败项，不部分提交脏状态。

#### Scenario: Import a sprite PNG into the Demo package
- **WHEN** AI 调 `fgui_import_resource` 指定 Demo 包与已存在的 PNG 文件路径
- **THEN** PNG 被导入并登记为包内 image 资源，返回其资源 id；`fgui_list_resources` 可查询到该项

#### Scenario: Import fails for a non-existent file
- **WHEN** AI 调 `fgui_import_resource` 且文件路径不存在
- **THEN** 返回结构化错误，包内资源清单不变

### Requirement: Component structure can be edited in-memory

MCP server MUST expose `fgui_add_child`（创建并添加子对象）、`fgui_delete_child`（删除文档中的对象）、`fgui_set_object_property`（修改已打开文档中对象的属性）。这些工具作用于编辑器内存态文档，作为「写 XML → register → validate」CLI 路径的补充。每次写操作 MUST 返回操作前后状态增量（如 childrenDelta），并保留可见性提示供人工或视觉验证。

#### Scenario: Add an image child to the active document
- **WHEN** AI 调 `fgui_add_child` 指定包、文档与新建对象的类型（image）/资源 id
- **THEN** 子对象被创建并插入文档，返回新增对象的 id 与 childrenDelta；文档标记为 modified

#### Scenario: Set property on an existing object
- **WHEN** AI 调 `fgui_set_object_property` 指定对象 id 与属性键值（如 xy/size/text）
- **THEN** 对象属性被更新，返回更新后的属性快照；非法属性键或只读属性返回结构化错误

#### Scenario: Delete a child object
- **WHEN** AI 调 `fgui_delete_child` 指定文档中的对象 id
- **THEN** 对象被移除，返回 childrenDelta；被其他对象引用（relation/gear）的对象删除时返回引用警告

### Requirement: Controllers can be managed programmatically

MCP server MUST expose 控制器管理工具：`fgui_list_controllers`（读）、`fgui_add_controller`、`fgui_update_controller`、`fgui_remove_controller`、`fgui_switch_page`（写）。这些工具是 controller 驱动 UI 状态的唯一程序化通道，MUST 与 `tools/fgui validate` 的 controller 配对校验语义一致（页面列表、selected 索引合法性）。

#### Scenario: List controllers of a component
- **WHEN** AI 调 `fgui_list_controllers` 指定包与组件
- **THEN** 返回控制器列表，每个含名称、页面（索引+名称）、当前选中页

#### Scenario: Add a controller with pages
- **WHEN** AI 调 `fgui_add_controller` 指定包、组件、控制器名称与页面列表
- **THEN** 控制器被添加并返回其页面；`fgui_list_controllers` 可查询到新控制器

#### Scenario: Switch a controller page
- **WHEN** AI 调 `fgui_switch_page` 指定控制器与目标页
- **THEN** 控制器选中页被切换，返回新的 selected 索引；目标页不存在时返回结构化错误

#### Scenario: Remove a controller in use
- **WHEN** AI 调 `fgui_remove_controller` 删除仍被 gearDisplay/gearXY 等引用的控制器
- **THEN** 返回引用警告（列出引用它的对象），不静默破坏现有引用

### Requirement: Relations can be managed programmatically

MCP server MUST expose `fgui_set_relation`、`fgui_remove_relation`。设置关系时 MUST 内置校验：单个 `<relation>` 的 `sidePair` 最多 2 项，超出即拒绝；目标对象不存在或非法 sidePair 值返回结构化错误。

#### Scenario: Set a stretch relation on an object
- **WHEN** AI 调 `fgui_set_relation` 指定目标对象与 `sidePair="width-width,height-height"`
- **THEN** 关系被添加；后续 `tools/fgui validate` 通过

#### Scenario: Relation exceeds sidePair limit
- **WHEN** AI 调 `fgui_set_relation` 传入 3 项 sidePair
- **THEN** 返回结构化错误，关系不被添加

### Requirement: Package and resource tree can be managed

MCP server MUST expose 包与资源树管理工具：`fgui_create_package`、`fgui_delete_package`、`fgui_create_folder`、`fgui_rename_resource`、`fgui_move_resource`、`fgui_delete_resource`、`fgui_create_component`、`fgui_copy_items`。删除与复制类操作 MUST 先返回影响范围（被引用项/依赖项清单），由调用方确认后才执行；破坏性操作失败不留下部分状态。

#### Scenario: Create an empty component item
- **WHEN** AI 调 `fgui_create_component` 指定包与组件名
- **THEN** 空组件资源被创建并返回资源 id；资源 id 使用前缀续编（next-id 语义），与 `tools/fgui` 一致

#### Scenario: Copy an item with dependencies across packages
- **WHEN** AI 调 `fgui_copy_items` 指定源包、目标包与组件
- **THEN** 组件及其依赖项被复制到目标包，返回复制后的 id 映射；跨包复制遵循 CopyHandler 语义

#### Scenario: Delete a referenced resource
- **WHEN** AI 调 `fgui_delete_resource` 且该资源仍被其他组件引用
- **THEN** 返回引用清单并拒绝执行；调用方需先解除引用或确认删除

### Requirement: Branch management is exposed

MCP server MUST expose `fgui_list_branches`（读）与 `fgui_switch_branch`（写）。分支名由 `project.allBranches` 动态获取，禁止硬编码；切换后返回活动分支名。

#### Scenario: List and switch branches
- **WHEN** AI 调 `fgui_list_branches` 后调 `fgui_switch_branch` 指定存在的分支
- **THEN** 返回分支清单；切换成功并返回新的活动分支；目标分支不存在时返回结构化错误

### Requirement: Read-side queries cover project settings, searches, and document structure

MCP server MUST expose 读侧查询工具：`fgui_read_project_settings`（Adaptation/Common/I18n/PackageGroup 设置）、`fgui_find_unused_resources`、`fgui_find_duplicate_resources`、`fgui_full_search`、`fgui_read_document`（已打开文档的结构快照）、`fgui_list_transitions`（组件过渡列表）。这些工具 MUST 返回结构化结果，不做任何写操作。

#### Scenario: Query project settings and document structure
- **WHEN** AI 调 `fgui_read_project_settings` 与 `fgui_read_document` 指定包/组件
- **THEN** 返回对应设置快照与文档结构（子对象/控制器/关系），结果只读

#### Scenario: Find unused resources produces a report only
- **WHEN** AI 调 `fgui_find_unused_resources` 指定包
- **THEN** 返回未使用资源清单作为报告；不执行任何删除

### Requirement: Forbidden edit paths are blocked at the handler layer

编辑器 handler MUST 屏蔽项目禁止的编辑路径：拒绝创建/编辑 `graph` 组件（`FObjectFactory.CreateObject(pkg,"graph")` 返回结构化错误）、拒绝手写 transition XML 写操作（`Document.AddTransition` 不通过 handler 暴露，只允许读/播放）。违规调用 MUST 返回结构化错误并说明项目约束。

#### Scenario: Attempt to create a graph object is rejected
- **WHEN** AI 调用编辑器写工具创建类型为 `graph` 的对象
- **THEN** 返回结构化错误，说明项目禁止 `<graph>` 节点，纯色视觉应走 sprite 图片

#### Scenario: Transition write is not exposed
- **WHEN** AI 尝试通过 MCP 写入 transition
- **THEN** 返回结构化错误，说明自建组件禁止手写 transition，动画由 TS 推进 controller 实现
