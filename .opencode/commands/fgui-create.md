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

3. 输出布局树 spec（从底到顶）：对象名、类型、坐标、尺寸、字号（档位表）、颜色、引用资源。信息缺失列入"待确认项"，禁止臆造。

## 阶段 3：生成 XML

4. 基于 spec 输出组件 XML。id 唯一；图片 src 必须是 package.xml 已登记资源 id（先跑 `list-resources` 确认，不得编造）。**禁止使用 `<graph>` 组件**（纯色背景/按钮/面板等一律用 sprite 生成图片 + `<image>` 引用）。
5. 若需新图片资源：给出 ASCII 画布 + 调色板，用 `bun run fgui sprite --package <包名> --name <文件.png> --palette <调色板> --art <多行ASCII> [--scale9grid l,t,r,b] --path <目录>` 生成并登记。
6. 新组件登记用 `bun run fgui register-component --package <包名> --name <组件文件.xml>`（幂等，已存在返回原 id），**禁止手改 package.xml 登记条目**。
7. 将组件 XML 写入 `ui/demo/assets/<包名>/` 下。

## 阶段 4：校验与交付

8. 运行 `bun run fgui validate --package <包名> [--component <组件名>]` 校验。有 error 必须修正后重跑直到通过。
9. 结尾列出需人工在 FGUI 编辑器确认的事项（九宫格、字体、间距观感等）。

**边界**：只产出/修改源 XML、PNG 与 package.xml 登记；发布 .bin 与 atlas 由用户用 FGUI 编辑器完成。
