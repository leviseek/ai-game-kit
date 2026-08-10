## Purpose

为 FGUI 工作流中的视觉确认环节提供 AI 通道：一个绑定本地可用多模态模型 `codexapis/gpt-5.6-sol` 的视觉验证 subagent，接收编辑器截图/设计稿并输出结构化核验结论，覆盖布局、像素、预览、缩略图等需要人眼判断的环节，替代人工逐一目检。

## ADDED Requirements

### Requirement: Visual verification is delegated to a multimodal subagent

项目 MUST 提供名为 `visual-verifier` 的 subagent（`.opencode/agent/visual-verifier.md`，`mode: subagent`，`model: codexapis/gpt-5.6-sol`，原 `visual-verifier` 随泛化重命名）。该 subagent MUST 接收一张或多张图像（编辑器截图、运行时截图、设计稿、组件预览图），并输出结构化的视觉核验结论：发现的问题列表（位置/层级/像素细节）、每项与需求的符合度、以及建议修复点。输出 MUST 可被调用方（fgui-designer 或主会话）转化为具体的写工具调用。subagent 支持双模式：默认 `general`（与 UI 框架无关的布局/层级/尺寸/像素核验，适用任意渲染截图），`mode=fgui` 叠加 FGUI 专项检查（controller/gear 状态、交互组件骨架、graph/transition 禁令）。

#### Scenario: Verify a rendered component against its design
- **WHEN** 调用方给 `visual-verifier` 一张设计稿与一张组件截图
- **THEN** 返回按对象逐项对照的核验结论：布局偏差、层级顺序、颜色/字号观感，标注与设计稿不符的具体位置

#### Scenario: Verify after an in-memory structural edit
- **WHEN** AI 用 `fgui_add_child`/`fgui_set_object_property` 修改组件后截图，并交给 `visual-verifier` 复核
- **THEN** 返回新增/变更对象是否按预期渲染、是否有遮挡或越界的结论

### Requirement: Visual verification is read-only and non-committal

`visual-verifier` MUST 只做视觉判断，不直接执行写操作；发现的问题 MUST 以「建议修复点 + 对应写工具」的形式返回，由调用方决定是否落地。subagent 对无法确认的视觉细节（字体观感、间距是否美观）MUST 明确标注为「需人工最终确认」，不得替用户做审美决策。

#### Scenario: Verifier reports issues without editing
- **WHEN** `visual-verifier` 在截图中发现对齐偏差
- **THEN** 只返回偏差描述与建议的 `fgui_set_object_property` 参数，不直接修改任何文档

#### Scenario: Ambiguous aesthetic details are flagged for human review
- **WHEN** 截图存在无法客观判定的观感问题（如字号是否过大）
- **THEN** 输出标注「需人工确认」，不替用户下结论

### Requirement: Screenshots are captured through the editor bridge

为支持视觉验证，编辑器桥 MUST 提供截图采集能力：`fgui_capture_preview` 或等效通道，从编辑器捕获当前活动文档/预览的位图并落盘为 PNG，供 `visual-verifier` 读取。捕获失败（编辑器不可达、视图不可用）MUST 返回结构化错误。

#### Scenario: Capture the active document as a PNG
- **WHEN** AI 调截图工具捕获活动文档
- **THEN** 生成 PNG 文件并返回文件路径；该文件可被 `visual-verifier` 作为图像输入读取

#### Scenario: Capture fails when editor is unreachable
- **WHEN** 编辑器桥不可达时调用截图工具
- **THEN** 返回结构化错误，说明编辑器不可达，不产生半截图像
