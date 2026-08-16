---
description: "编辑 FGUI 组件：修改已有组件 XML，先建立对象索引再改，校验通过才算完成"
agent: fgui-designer
---

编辑 FGUI 组件。$ARGUMENTS

按以下流程执行（编辑是写操作，必须走此确定性流程，不得凭记忆直接改）：

## 阶段 1：建立上下文

1. 确认目标包名与组件名。运行 `bun run fgui read-component --package <包名> --component <组件名>` 获取对象 id 索引。
2. 运行 `bun run fgui list-resources --package <包名>` 获取可复用资源清单。
3. 按需 Read 组件 XML 原文与 package.xml，结合索引精确定位要改的对象。

## 阶段 2：产出目标 spec 并校验

4. 产出**编辑后目标状态的 spec.json**（结构化 JSON：canvas/package/objects/pending，字段与 `/fgui-create` 一致；交互对象标记 `interactive: true` + `componentType` + `rationale`，字号 ∈ 档位表，relation sidePair ≤ 2，语义化命名）。
5. 运行 `bun run fgui spec-check --spec <spec.json>`，**有 error 必须修正后重跑直到通过**，才进入修改阶段。

## 阶段 3：修改

6. 只改动用户要求的对象；保持未涉及部分原样，不顺手重构。
7. 改引用（src/relation target/gear 页面）前用索引核实 id 存在；新引用资源必须已在 package.xml 登记。**禁止使用 `<graph>` 组件**，纯色视觉一律用 sprite 生成图片 + `<image>` 引用。调整布局时保持/补充必要的 `<relation>`（铺满、居中、贴底、随兄弟）；单个 relation 的 sidePair 最多 2 项，禁止凭相似性叠加第 3 项。
8. 新增图片资源走 `bun run fgui sprite ...` 生成并登记；新 id 用 `bun run fgui next-id --package <包名>` 分配。
9. 将改动写入磁盘。

## 阶段 4：校验与交付

10. 运行 `bun run fgui validate --package <包名> --component <组件名> --strict`（含引用完整性 + 语义：controller 配对、扩展节点必备结构、relation sidePair 项数与合法性、graph 禁令）。有 error 必须修正后重跑直到通过。
11. 在 FGUI 编辑器中刷新并打开目标组件，确认无读取错误；结尾记录该结果，并列出仍需人工确认的布局、九宫格、字体观感等事项。

**边界**：只修改源 XML、PNG 与 package.xml 登记；发布 .bin 与 atlas 由用户用 FGUI 编辑器完成。
