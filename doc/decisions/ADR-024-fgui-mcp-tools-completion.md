# ADR-024 FGUI 编辑器 MCP 工具面补全（写闭环 + 视觉验证 subagent）

## 状态

Accepted

## 背景

ADR-023 建立了 fgui-mcp 的「读 + 发布」两端工具面，但中间层（资源导入、组件结构编辑、控制器/关系/包/分支管理）空白：`fgui_insert_component` 会 `SetModified` 却没有保存工具，内存态修改与磁盘 XML 失配；需要人眼确认的视觉环节（布局/预览/截图核验）没有 AI 可用通道。目标：把 fgui-mcp 补全到「AI 可程序化完成编辑器内几乎全部确定性操作」，并把视觉确认环节交给一个绑定多模态模型的视觉验证 subagent。

## 决策

### 1. 写工具统一「内存态操作 + 显式保存」闭环

- 新增 `fgui_save_documents`（保存活动/全部未保存文档）；所有内存态写工具（`add_child`/`set_object_property`/控制器/关系等）只标记文档 modified，由显式保存落盘。
- `fgui_trigger_publish` 发布前强制保存全部未保存文档，保存失败即中止发布——保证 `fgui_check_publish` 三重证据不因脏文档失真。
- 理由：编辑器内存态与磁盘失配正是本补齐要修复的根因；发布前保存形成「修改→保存→发布→检测」完整闭环。备选（每写工具直接落盘）被否：失去撤销窗口且编辑器并发写有竞态。

### 2. 视觉验证由多模态 subagent 承担，不做「人眼模拟」的断言

- 新建 `.opencode/agent/fgui-visual-verifier.md`（`mode: subagent`，`model: codexapis/gpt-5.6-sol`）：只做视觉判断，输出结构化核验结论（问题列表/符合度/建议修复点 + 对应写工具参数），不执行写操作。
- 配套 `fgui_capture_preview` 截图工具：editor.d.ts 无 `App.Capture`/`EncodeToPNG`，走 OS 级窗口截图（PowerShell System.Drawing）备选。
- 理由：布局/像素「好不好看」无法用断言验证；把视觉环节显式委托给多模态模型 + 人工兜底，比在 MCP 层做脆弱的像素断言更可靠。观感项（字体/间距/配色）必须标注「需人工确认」，AI 不替用户做审美决策。

### 3. handler 层硬屏蔽项目禁止路径

- `graph` 对象创建/修改在 `assertForbiddenObjectType` 统一拒绝（项目禁止 `<graph>`，纯色视觉走 sprite）。
- transition XML 写入（`Document.AddTransition`）不暴露任何写通道，只保留读（`fgui_read_document`/`fgui_list_controllers` 之外的 transition 读列表）。
- 理由：AGENTS.md 第 9/10 条是项目红线，AI 工具化不得绕过；在 handler 层拒绝比依赖调用方自律更可靠。

### 4. 破坏性操作一律二次确认

- `delete_package`/`delete_resource` 先返回影响范围（资源数/引用清单），调用方传 `confirm: true` 才执行；未使用/重复资源检查只出报告不删除。
- 理由：AI 无意识的批量删除不可逆；「先报告、再确认」保留人工边界。

### 5. 高风险 API 探针先行、实机回填

- `ImportResource`/`CopyHandler`/`AddController`/截图四类新 API 先写探针（`src/probes/`），实机运行后把结论回填到工具描述的能力受限标注。
- 理由：这些 API 在 editor.d.ts 有签名但无实机证据；探针（仿 ADR-023 模式）先验证调用链再固化，失败回退到「写 XML → register → validate」CLI 路径，不阻塞现有确定性工作流。

## 理由

- 写闭环（决策 1）是本次补全的根因修复：没有保存工具，任何「AI 改完→用户发布」流程都会产生陈旧 bin。
- 视觉 subagent（决策 2）把「需要人眼」的环节显式委托给多模态模型，是现有 fgui-designer（同模型）读图能力的对称延伸，构成「生成→验证→修复」闭环。
- 禁止路径硬屏蔽（决策 3）与项目红线一致，且把校验前移到 handler 层，配合 `tools/fgui validate --strict` 形成双保险。

## 影响

- 扩展 `tools/fgui-mcp/lib/tools.ts`（读 11 + 写 27 + 检测 1）、`ui/demo/plugins/fgui-mcp-probe/src/mailbox/handlers*.ts`（新增 handler）。
- 新增 `.opencode/agent/fgui-visual-verifier.md` 与 `fgui_capture_preview` 截图通道。
- 新写工具全部走「内存态 + 显式保存 + 二次确认」，不改变 `tools/fgui` CLI 的 XML 生成/校验权威；发布产物仍由编辑器生成，检测链路只读。
- 实机验证项（探针结论、编辑器闭环）需用户配合编辑器运行后回填，不回填不阻塞代码侧交付。
