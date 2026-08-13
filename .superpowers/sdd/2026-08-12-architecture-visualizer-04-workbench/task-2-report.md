# Task 2 Report: 六类确定性布局

## 状态

DONE

## 改动

- 新增 `tools/arch-viewer/web/layout/types.ts`，定义 `Viewport`、`LayoutNode`、`LayoutEdge`、`LayoutLane`、`LayoutGraph`。
- 新增 `tools/arch-viewer/web/layout/shared.ts`，提供 `layoutView(view, viewport)` 分发、节点尺寸估算、lane 布局、稳定排序、空画布与 polyline 边路由。
- 新增六类布局模块：`hierarchy.ts`、`startup.ts`、`dependencies.ts`、`data-flow.ts`、`calls.ts`、`resources.ts`。
- 新增 `tools/arch-viewer/test/layouts.test.ts`，覆盖六类 fixture、无重叠、稳定坐标、lane 顺序、错误边 diagnostic id、空图最小画布、dependency 环、calls 中心固定。

## TDD / 验证命令和结果

- RED: `bun test tools/arch-viewer/test/layouts.test.ts`
  - 结果：FAIL，原因符合预期：`Cannot find module '../web/layout/shared'`。
- GREEN: `bun test tools/arch-viewer/test/layouts.test.ts`
  - 结果：PASS，`8 pass, 0 fail, 51 expect() calls`。
- `bun x tsc --noEmit -p tools/arch-viewer/tsconfig.web.json`
  - 结果：PASS，无输出。
- `git diff --check`
  - 结果：PASS，无输出。

## 自审

- 新增文件均小于 300 行。
- 未引入依赖、DOM、renderer、CDN、canvas 库或前端框架。
- 未使用 `as any`、`@ts-ignore`。
- `LayoutGraph.nodes` 和 `LayoutGraph.edges` 按 id 稳定排序。
- `viewport` 只参与 lane 间距上限和 calls 画布宽度，不改变逻辑 lane/layer 顺序。
- dependency 拓扑环会进入最后一层，相关环边附加 `layout.cycle` diagnostic id，不会无限循环。

## Concerns

- 当前布局只做基础直线/正交 polyline，不做避障搜索，符合本任务边界；后续 renderer 需要根据 `diagnosticIds` 和 lane 信息补可访问的视觉表达。
