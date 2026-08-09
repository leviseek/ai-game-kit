## Why

当前 fgui-mcp 的 12 个工具只覆盖了「读」与「发布」两端：能查包/资源、切换发布配置、触发发布并检测一致性，但中间层（资源导入、组件内部结构编辑、控制器操作、文档保存）几乎空白，写操作闭环断裂——`fgui_insert_component` 会 `SetModified` 却没有保存工具，导致内存与磁盘 XML 失配、`fgui_check_publish` 三重证据失真。同时，「需要人工视觉确认」的环节（布局微调、预览确认、截图验证）没有 AI 可用的通道，阻塞全自动 UI 工作流。目标是把 fgui-mcp 补全到「AI 可程序化完成编辑器内几乎全部确定性操作」，并把视觉确认环节交给一个绑定多模态大模型的视觉验证 subagent。

## What Changes

- **新增一组编辑器桥写工具**，补齐写操作闭环：
  - 文档生命周期：`fgui_save_documents`（保存活动/全部未保存文档，发布前强制保存）。
  - 资源导入：`fgui_import_resource`（把外部 PNG 导入包内并登记为资源，`ResourceImportQueue` 语义）。
  - 组件内部结构：`fgui_add_child`、`fgui_delete_child`、`fgui_set_object_property`（内存态编辑已打开文档，替代手写 XML 后 register 的弱校验路径）。
  - 控制器：`fgui_list_controllers`、`fgui_add_controller`、`fgui_update_controller`、`fgui_remove_controller`、`fgui_switch_page`（项目第 10 条强制 controller 驱动的唯一通道）。
  - 关系系统：`fgui_set_relation`、`fgui_remove_relation`（内置 sidePair ≤2 校验）。
  - 包/资源树：`fgui_create_package`、`fgui_delete_package`、`fgui_create_folder`、`fgui_rename_resource`、`fgui_move_resource`、`fgui_delete_resource`、`fgui_create_component`、`fgui_copy_items`（CopyHandler 带依赖复制）。
  - 分支管理：`fgui_list_branches`、`fgui_switch_branch`。
- **新增编辑器桥读工具**：`fgui_read_project_settings`（Adaptation/Common/I18n/PackageGroup）、`fgui_find_unused_resources`、`fgui_find_duplicate_resources`、`fgui_full_search`、`fgui_read_document`（已打开文档的结构快照）、`fgui_list_transitions`。
- **新增视觉验证 subagent** `fgui-visual-verifier`：绑定本地可用多模态模型 `codexapis/gpt-5.6-sol`，接受编辑器截图/设计稿，负责布局与像素级验证、预览结果确认、资源缩略图/切图九宫格核验等「需要视觉」环节。
- **明确不工具化的边界并说明原因**（详见 design.md）：
  - 依赖交互手势：拖拽/剪贴板、文档拾取（DragDropManager/NativeDragDrop）——无公开非交互 API。
  - 阻塞式对话框：`App.Alert/Confirm/Input`——AI 无法点击；`LibraryView.ShowImportResourcesDialog` 改用底层 `ImportResource`。
  - 高风险/破坏性：颜色空间切换（影响全工程渲染）、未使用资源批量删除（AI 只输出报告不执行删除）。
  - 项目禁止项：`graph` 组件创建/编辑、transition XML 手写（handler 层屏蔽）。
  - 强视觉操作（Gizmo 顶点/路径编辑、资源缩略图）转交 `fgui-visual-verifier` 或人工。
  - 编辑器状态破坏：`TestView.Start` 预览会覆盖 `runInBackground` 标志，预览启动仍保留人工边界，视觉验证由 subagent 对截图完成。
- **非破坏性**：不迁移 `tools/fgui` 确定性能力，XML 生成/校验权威仍留在 CLI；新写工具与 fgui-designer 的「写 XML → register → validate」路径互为补充。

## Capabilities

### New Capabilities

- `fgui-visual-verification`: 视觉验证 subagent 能力——绑定 `codexapis/gpt-5.6-sol` 多模态模型，接收编辑器截图/设计稿并输出结构化的视觉核验结论，覆盖布局、像素、预览、缩略图等需要人工视觉的环节。

### Modified Capabilities

- `fgui-editor-mcp-bridge`: 扩展 MCP server 工具面——从「读 + 发布」两端补齐为覆盖文档保存、资源导入、组件结构编辑、控制器/关系/包/分支管理的完整确定性工具面，并补充发布前强制保存与读侧查询工具。

## Impact

- **代码**：扩展 `tools/fgui-mcp/lib/tools.ts`（新增工具注册）、`ui/demo/plugins/fgui-mcp-probe/src/mailbox/handlers.ts` 与 `handlers-write.ts`（新增 handler）、`lib/bridge.ts`（如需要）、`lib/check-publish.ts`（发布前保存钩子）。
- **新增 agent 配置**：`.opencode/agent/fgui-visual-verifier.md`（subagent，`model: codexapis/gpt-5.6-sol`），可能配套截图采集工具（走编辑器桥 `App.Capture` 或 OS 级截图）。
- **发布产物**：`assets/ui/*/*.bin` 与 atlas 仍由编辑器发布生成，禁止手改；新增的导入/保存工具只写源 XML/PNG，不触碰产物。
- **风险**：`ImportResource`、`CopyHandler`、`Document.AddController` 等 API 无实机证据，实现需探针验证；新写工具全部走「switch 快照→操作→恢复/保存」的可回滚模式，避免破坏编辑器状态。
