# Lineup Editor Click Phase 5 FGUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AutoBattle 战场页支持运行时动态挂载 `UnitSlot`，并让编队页节点结构与 `view/lineup.ts` 的候选位、布阵格和选中态绑定契约完全一致。

**Architecture:** `AutoBattleView` 只保留静态 HUD，并嵌入一个空的本包容器组件 `BattlefieldUnitsCom` 作为动态单位父节点。`LineupEditorView` 使用 CommonButton 作为候选位和前六个布阵格的真实可点击节点，文本与选中态保持页面根级语义化命名，供现有 `getChild(name)` 绑定接缝直接解析。

**Tech Stack:** FairyGUI CocosCreator 5.0 源 XML、FGUI CLI、Bun、FairyGUI MCP。

## Global Constraints

- 禁止 `<graph>`；纯色视觉仅使用调色板允许颜色生成 sprite。
- 跨包引用仅指向 `Common`（`pkg="cmn00001"`）。
- `AutoBattleView` 静态节点名 `txt_round`、`txt_log`、`txt_result`、`txt_speed`、`btn_restart`、`btn_speed` 不变。
- `LineupEditorView` 必须提供 `candidate_0..5`、`txt_candidate_0_name..txt_candidate_5_name`、`slot_0..5`、`txt_slot_0_name..txt_slot_5_name`、`slot_selected_0..5`、`btn_start`。
- 修改后执行 `bun run fgui validate --package AutoBattle --strict` 和 `bun run fgui validate --package Common --strict`。
- 发布通过 FGUI 编辑器完成，不手改 `.bin` 或 atlas。

---

### Task 1: 战场空容器与静态 HUD

**Files:**
- Create: `ui/demo/assets/AutoBattle/BattlefieldUnitsCom.xml`
- Modify: `ui/demo/assets/AutoBattle/package.xml`（仅通过 `fgui register-component`）
- Modify: `ui/demo/assets/AutoBattle/AutoBattleView.xml`

**Interfaces:**
- Consumes: `gridToXY()` 输出的页面坐标，以及 Common `UnitSlot`（`com03`）。
- Produces: 页面根级 `container_units` GComponent，原点 `(0,0)`、尺寸 `1280×500`。

- [x] 使用 `fgui register-component` 幂等登记 `BattlefieldUnitsCom.xml`，写入空组件源 XML。
- [x] 将 `AutoBattleView.xml` 的 12 组固定单位节点全部删除。
- [x] 在背景之后嵌入 `container_units`，并保留六个静态 HUD/按钮节点名与原布局。
- [x] 用 `read-component` 确认组件只含背景、空容器和静态 HUD。

### Task 2: 编队页预置候选位与前六格绑定节点

**Files:**
- Modify: `ui/demo/assets/AutoBattle/LineupEditorView.xml`
- Create: `ui/demo/assets/AutoBattle/img/slot_selected.png`（仅在现有资源不能清晰表达选中态时）
- Modify: `ui/demo/assets/AutoBattle/package.xml`（图片仅通过 `fgui sprite` 登记）

**Interfaces:**
- Consumes: `createLineupEditorBindings()` 的页面根级节点名。
- Produces: 六个候选 Button、六个布阵 Button、六个名称文本、六个默认隐藏选中态图片；后三格只展示。

- [x] 删除 `list_candidates`。
- [x] 创建 `candidate_0..5` CommonButton 实例与对应 `txt_candidate_{i}_name` 文本。
- [x] 为前六格创建透明 CommonButton 点击层 `slot_0..5`，并为九格创建 `txt_slot_{i}_name` 和默认隐藏的 `slot_selected_0..8`。
- [x] 保留 `img_slot_0..8`、标题、背景和 `btn_start`。
- [x] 用 `read-component` 核对所有契约节点存在且唯一。

### Task 3: 校验、OpenSpec 状态与编辑器发布

**Files:**
- Modify: `openspec/changes/lineup-editor-click/tasks.md`

**Interfaces:**
- Consumes: 两个已更新组件与 Common 现有组件。
- Produces: strict validate 证据、编辑器发布结果和节点差异清单。

- [x] 运行 AutoBattle 与 Common 的 strict validate，修复所有 error。
- [x] 截图或预览核对空战场 HUD、候选位、前六格文本与选中态层级。
- [x] 通过编辑器发布 AutoBattle；若编辑器不可达，明确记录待发布。
- [x] 完成 4.3 后勾选 OpenSpec 任务 4.3；仅在 strict validate 与编辑器发布成功后勾选 4.4。
