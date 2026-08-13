## Context

参见 proposal.md - Why 与 ai-sensei 缺口分析。当前 fgui-mcp 架构：MCP server（`tools/fgui-mcp/`）经文件邮箱桥接与编辑器插件（`ui/demo/plugins/fgui-mcp-probe/`）通信；`lib/tools.ts` 分读/写/检测三组工具注册，handler 在插件侧 `src/mailbox/handlers*.ts`。`tools/fgui` CLI 仍是 XML 生成/校验的权威执行层。编辑器 API 面来自插件 `libs/editor.d.ts`（FairyEditor 命名空间，约 200 个类）。

## Goals / Non-Goals

**Goals:**

- 补齐写操作闭环：文档保存 → 资源导入 → 结构编辑 → 控制器/关系/包/分支管理，全部走编辑器桥且可回滚。
- 补齐读侧查询：工程设置、未使用/重复资源、全文搜索、文档结构、过渡列表。
- 提供视觉验证 subagent（绑定 `codexapis/gpt-5.6-sol`）与编辑器截图采集通道。
- 在 handler 层强制屏蔽项目禁止路径（graph、transition 写入）。

**Non-Goals:**

- 不迁移 `tools/fgui` 的 XML 生成/校验权威；新写工具与「写 XML → register → validate」路径互为补充而非取代。
- 不做依赖交互手势的编辑器能力（拖拽/剪贴板/拾取）、不接阻塞式对话框。
- 不做高风险破坏性自动删除（未使用资源只出报告）；不自动切换颜色空间。

## Decisions

### D1: 写工具延续「快照 → 操作 → 保存」可回滚模式

所有新增写工具沿用 `fgui_switch_publish_settings` 已验证的模式：操作前对受影响范围做快照，操作成功后标记文档 modified，交由 `fgui_save_documents` 持久化。删除/复制类破坏性操作先返回影响范围清单，由调用方二次确认。**备选**：一次性直接落盘——否定，编辑器内存态与磁盘失配正是本轮要修复的根因，且无法回滚。

### D2: 新增写工具统一收进 `handlers-write.ts`，新增读工具收进 `handlers.ts`

与现有分层一致：读工具在 `handlers.ts`、写工具在 `handlers-write.ts`，`handlers-publish.ts` 保持发布专属。每个新工具在 `lib/tools.ts` 注册一条 `{ description, run }`，描述注明副作用与回滚约束。**备选**：按功能域新建文件——否定，当前 handler 文件规模可控，拆分过早。

### D3: 资源导入走 `ResourceImportQueue` 批量语义而非对话框版 API

导入用 `FPackage.ImportResource` + `ResourceImportQueue`（排队逐项处理），不调用 `LibraryView.ShowImportResourcesDialog`（阻塞式对话框，AI 无法点击）。批量项部分失败时，已成功项保持已登记状态，错误项在结果中列出，不整体回滚——与编辑器手动导入语义一致，避免导入队列被一次坏文件拖死。

### D4: 控制器/关系操作与 `tools/fgui validate` 共用语义约束

`fgui_add_controller`/`fgui_set_relation` 在 handler 层内置与 CLI validate 一致的校验：controller 页面列表扁平配对、`selected` 索引合法、`sidePair` ≤2 且两侧取值合法（left/right/top/bottom/middle/center/width/height + ext 后缀 + `%`）。**备选**：交给后续 validate 兜底——否定，写坏再发现成本高，且违反「确定性操作」原则。

### D5: 视觉验证 subagent + 截图采集通道

新建 `.opencode/agent/fgui-visual-verifier.md`（`mode: subagent`，`model: codexapis/gpt-5.6-sol`），只做视觉判断，问题以「建议修复点 + 对应写工具」输出，不直接执行写操作。配套新增编辑器桥截图工具 `fgui_capture_preview`（`App.Capture` 或等效，落盘 PNG 返回路径）。`TestView.Start` 预览不自动启动（会覆盖 `runInBackground` 标志，见 `main.ts` 注释），视觉验证对截图完成。

### D6: 禁止路径在 handler 层硬屏蔽

`FObjectFactory.CreateObject(pkg,"graph")` 与 transition XML 写入（`Document.AddTransition`）在 handler 层拒绝并返回结构化错误（说明项目约束）。transition 只允许读/播放（`FTransition.Play`），与项目「动画由 TS 推进 controller」约束一致。

### D7: 新 API 一律先探针验证再固化

`ImportResource`、`CopyHandler`、`Document.AddController`、`App.Capture` 等无实机证据的 API，先写最小探针（仿 `src/probes/` 既有模式）验证调用链，通过后再固化为 handler；失败则回退到「文档+CLI 补充路径」并在工具描述注明能力受限。

### D8: 移植 FairyGUI-MCP 工具面（去重后补全）

参考 `D:\git-clone\FairyGUI-MCP`（Lua 插件 + Python MCP server）的工具面，去重当前已实现项后移植 9 个工具：open_component/show_preview/get_selection/select_element/close_document/get_component_info/get_logs/clear_logs/publish_all。关键取舍：

- **get_logs** 用 `FileShare.ReadWrite` 流式读 `Application.consoleLogPath`（Player.log）——`ReadAllText` 会因 Unity 进程独占锁抛 Sharing violation。
- **publish_all** 顺序遍历 `allPackages` 逐个 PublishHandler（复用 trigger_publish 的 deferred 模式），默认重定向 scratch。
- **不移植项**：`start_test`/`stop_test`（F5 覆盖 `runInBackground`，main.ts 注释明确警告）、`switch_device`/`list_devices`（依赖 testView 内部状态，高风险）、`activate`（Python 端 Win32 窗口激活，非编辑器 API）、`reload_plugin`（FairyGUI-MCP 自身仍通过 probe_plugin_api 探测）、`open_publish_settings`/`probe_*`（调试/探针性质）。
- 理由：FairyGUI-MCP 是经实机验证的参考实现，其稳定能力可直接移植；未移植项风险/适用性不符合本项目「确定性工具」原则。

## Risks / Trade-offs

- [新 API 无实机证据可能失败] → D7 探针先行；失败的 API 用现有 CLI 路径兜底，不阻塞发布。
- [结构编辑在内存态，未保存时 `fgui_check_publish` 失真] → D1 的保存工具 + 发布前强制保存钩子，形成闭环。
- [批量导入部分失败留下半登记状态] → D3 明确「成功项保持，错误项列出」语义，避免假性整体回滚。
- [视觉验证依赖截图质量，截图与真实渲染可能有偏差] → 截图工具落盘完整位图，subagent 明确标注像素级不确定项供人工复核。
- [批量写工具刷新全部包导致编辑区闪烁（既有副作用）] → 延续现有描述标注，不新增规避（编辑器设计使然）。

## Migration Plan

- 部署顺序：先加读侧查询与保存工具（无破坏性）→ 再加固有风险 API 的探针 → 再上结构编辑/控制器/关系/包管理 → 最后接视觉验证 subagent 与截图工具。
- 回滚：新工具全部走「快照 → 操作 → 保存」模式，任一失败可基于快照恢复；工具未发布到公开工具面（仅注册表新增），停用即回退。

## Open Questions

- `App.Capture` 是否为编辑器公开 API 需实机确认；若不可用，截图通道改为 OS 级窗口截图（PowerShell `System.Drawing`）作为替代实现。此问题不改变 spec 行为（截图工具职责相同），可延后到实现期探针阶段。
