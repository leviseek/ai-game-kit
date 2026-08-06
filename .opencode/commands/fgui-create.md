---
description: "创建 FGUI 组件：根据设计稿截图或文字描述生成组件 XML 并登记到 package.xml"
agent: fgui-designer
---

创建 FGUI 组件。$ARGUMENTS

按以下流程执行：

## 阶段 1：确定输入与包

1. 读取用户需求（设计稿图片路径 或 纯文字描述）。若是图片，先读图提取 UI 结构。
2. 确认目标包名（默认 `Demo`）。需要时可运行 `bun run fgui list-resources --package <包名>` 查看现有资源。

## 阶段 2：产出 UI spec

3. 输出布局树 spec（从底到顶）：对象名、**组件类型（含选择依据）**、坐标、尺寸、字号（档位表）、颜色、引用资源。交互区域必须按 fgui-designer 的"组件类型决策"表选择组件（Button/Slider/ProgressBar/ComboBox/List/TextInput 等），禁止退化成裸 image+text。信息缺失列入"待确认项"，禁止臆造。
4. **先查库**：涉及 Button/ComboBox/List/TextInput 时，先 `bun run fgui list-resources --package Basic` + 按需 `read-component`，能嵌套引用现成组件就不从零生成。

## 阶段 3：生成 XML

5. 基于 spec 输出组件 XML。id 唯一；图片 src 必须是 package.xml 已登记资源 id（先跑 `list-resources` 确认，不得编造）。**禁止使用 `<graph>` 组件**。交互组件必须带完整结构（controller 骨架 + 命名约定子节点 + 扩展节点），参数从模板抄。**需要自适应的布局必须加 `<relation>`**（铺满/居中/贴底/随兄弟），不要只用死坐标，sidePair 用合法值。**禁止手写 transition**。子元件 name 语义化（txt_/btn_/bg_/bar_ 前缀）。
6. 若需新图片资源：给出 ASCII 画布 + 调色板，用 `bun run fgui sprite --package <包名> --name <文件.png> --palette <调色板> --art <多行ASCII> [--scale9grid l,t,r,b] --path <目录>` 生成并登记。**颜色必须 ⊆ `ui/demo/palette.json` 允许集合**。
7. 新组件登记用 `bun run fgui register-component --package <包名> --name <组件文件.xml> [--path <子目录>]`（幂等，已存在返回原 id），**禁止手改 package.xml 登记条目**。资源 id 用 `bun run fgui next-id --package <包名> --prefix <前缀>` 前缀续编。
8. 将组件 XML 写入 `ui/demo/assets/<包名>/` 下（可复用组件建议放 `component/`，整屏 View 放包根）。

## 阶段 4：校验与交付

9. 运行 `bun run fgui validate --package <包名> [--component <组件名>]` 校验（含引用完整性 + 语义：controller 配对、扩展节点必备结构、image fill、fileName 一致、transition 禁令、graph 禁令）。有 error 必须修正后重跑直到通过。
10. 结尾列出需人工在 FGUI 编辑器确认的事项（九宫格、字体、间距观感等）。

**边界**：只产出/修改源 XML、PNG 与 package.xml 登记；发布 .bin 与 atlas 由用户用 FGUI 编辑器完成。
