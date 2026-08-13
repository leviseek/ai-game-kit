# Architecture Visualizer Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现原生 SVG 图谱工作台、六类确定性布局、源码 Inspector、实时刷新状态保留，并完成全仓验证与文档收口。

**Architecture:** 前端拆为无 DOM 的 state/layout 纯函数与薄 DOM/SVG renderer。所有视图共享 shell、selection、filters、breadcrumbs 和 Inspector；每类布局只把 `GraphView` 投影为 `LayoutGraph`。

**Tech Stack:** Browser ES modules、DOM、CSS、SVG、EventSource、Bun test、TypeScript DOM lib。

## Global Constraints

- 遵守 rollout 总计划及前三阶段接口。
- 禁止内联第三方脚本、CDN、canvas 图库或前端框架。
- UI 必须桌面可用且窄屏 Inspector 下置；颜色不是诊断的唯一表达方式。

---

### Task 1: 前端状态、API client 与 SSE 刷新

**Files:**

- Create: `tools/arch-viewer/web/types.ts`
- Create: `tools/arch-viewer/web/api.ts`
- Create: `tools/arch-viewer/web/state.ts`
- Create: `tools/arch-viewer/web/events.ts`
- Test: `tools/arch-viewer/test/web-state.test.ts`

**Interfaces:**

- Produces: `WorkbenchState { viewType, filters, breadcrumbs, selectedNodeId?, snapshotVersion, status }`。
- Produces: `reduceWorkbench(state, action): WorkbenchState`。
- Produces: `reconcileSnapshot(state, view): WorkbenchState`。
- Produces: `ArchApiClient` 与 `connectSnapshotEvents(onEvent): dispose`。

- [ ] **Step 1: 写状态恢复失败测试**

断言切图保留可映射 selected id；新快照缺失焦点时沿 breadcrumb 退回最近 group；筛选与缩放状态不因 `snapshot-ready` 重置；`analysis-error` 只更新 banner。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tools/arch-viewer/test/web-state.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现纯 reducer 与 API/SSE client**

EventSource 收到 `snapshot-ready` 后先 GET 当前 view，再 reconcile；错误时不清空当前 graph。API client 对非 2xx 抛含 status/path 的 `ArchApiError`。

```ts
export function reconcileSnapshot(state: WorkbenchState, view: GraphView): WorkbenchState {
    const selected = view.nodes.some((node) => node.id === state.selectedNodeId) ? state.selectedNodeId : nearestExistingBreadcrumb(state.breadcrumbs, view);
    return { ...state, selectedNodeId: selected, status: "ready" };
}
```

- [ ] **Step 4: 验证状态层**

Run: `bun test tools/arch-viewer/test/web-state.test.ts`

Run: `bunx tsc --noEmit -p tools/arch-viewer/tsconfig.web.json`

Expected: PASS。

- [ ] **Step 5: 提交（仅获授权时）**

建议信息 `feat: 管理架构工作台前端状态`。

---

### Task 2: 六类确定性布局

**Files:**

- Create: `tools/arch-viewer/web/layout/types.ts`
- Create: `tools/arch-viewer/web/layout/shared.ts`
- Create: `tools/arch-viewer/web/layout/hierarchy.ts`
- Create: `tools/arch-viewer/web/layout/startup.ts`
- Create: `tools/arch-viewer/web/layout/dependencies.ts`
- Create: `tools/arch-viewer/web/layout/data-flow.ts`
- Create: `tools/arch-viewer/web/layout/calls.ts`
- Create: `tools/arch-viewer/web/layout/resources.ts`
- Test: `tools/arch-viewer/test/layouts.test.ts`

**Interfaces:**

- Produces: `LayoutNode`、`LayoutEdge`、`LayoutGraph { width, height, nodes, edges, lanes }`。
- Produces: `layoutView(view, viewport): LayoutGraph`。

- [ ] **Step 1: 写六布局失败测试**

每类 fixture 断言节点无重叠、坐标稳定、lane 顺序正确、错误边保留 diagnostic id、空图有最小画布。Hierarchy 从左到右按 depth；startup/data/resource 按配置顺序；dependency 使用拓扑层；calls 中心固定。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tools/arch-viewer/test/layouts.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现共享尺寸与 edge route**

节点宽高基于 label 长度的有界估算；边为正交或直线 polyline，不做避障搜索。拓扑环进入最后一层并附 `layout.cycle` diagnostic，不无限循环。

```ts
export function layoutView(view: GraphView, viewport: Viewport): LayoutGraph {
    switch (view.type) {
        case "hierarchy":
            return layoutHierarchy(view, viewport);
        case "startup":
            return layoutStartup(view, viewport);
        case "dependencies":
            return layoutDependencies(view, viewport);
        case "data-flow":
            return layoutDataFlow(view, viewport);
        case "calls":
            return layoutCalls(view, viewport);
        case "resources":
            return layoutResources(view, viewport);
    }
}
```

- [ ] **Step 4: 实现六类布局**

保持每文件单一布局职责且 <300 行；输出按 node id 稳定排序，viewport 仅影响间距上限，不改变逻辑层顺序。

- [ ] **Step 5: 验证布局**

Run: `bun test tools/arch-viewer/test/layouts.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交（仅获授权时）**

建议信息 `feat: 布局六类架构图`。

---

### Task 3: App shell、SVG renderer 与 Inspector

**Files:**

- Create: `tools/arch-viewer/web/index.html`
- Create: `tools/arch-viewer/web/styles.css`
- Create: `tools/arch-viewer/web/app.ts`
- Create: `tools/arch-viewer/web/render/svg.ts`
- Create: `tools/arch-viewer/web/render/sidebar.ts`
- Create: `tools/arch-viewer/web/render/inspector.ts`
- Create: `tools/arch-viewer/web/render/search.ts`
- Create: `tools/arch-viewer/web/vscode.ts`
- Test: `tools/arch-viewer/test/vscode-link.test.ts`

**Interfaces:**

- Produces: 设计确认的左导航/中画布/右 Inspector/顶部搜索工作台。
- Produces: `createVsCodeUrl(location): string`，只对 `/api/source` 返回的已验证 `SourceLocation` 调用。

- [ ] **Step 1: 写 VS Code URL 与 HTML shell 失败测试**

断言 Windows 路径正确 URL encode，line/column 保留；`index.html` 包含六导航、search、canvas、inspector、status 的稳定 element ids，无外部 script/link URL。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tools/arch-viewer/test/vscode-link.test.ts tools/arch-viewer/test/workspace.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 shell 与 SVG renderer**

节点为可聚焦 `<g role="button" tabindex="0">`，边含 `<title>`，diagnostic 同时用颜色、线型和文本 badge；pointer drag 平移，wheel 缩放，按钮支持 fit/reset。单击 select，双击 group 请求展开。

```ts
const group = svgElement("g", { role: "button", tabindex: "0", "data-node-id": node.id });
group.append(svgElement("rect", node.bounds));
group.append(svgText(node.label));
group.addEventListener("click", () => dispatch({ type: "select-node", id: node.id }));
group.addEventListener("dblclick", () => expandNode(node.id));
```

- [ ] **Step 4: 实现 Inspector/search/breadcrumbs**

Inspector tabs 为 Source/Relations/Evidence/Diagnostics；source 使用 `<pre>` textContent，禁止 innerHTML。Search debounce 150ms，结果显示 kind/path；切换视图时以 node/group id 尝试映射。

- [ ] **Step 5: 实现响应式样式**

桌面三列；小于 900px 时 sidebar 收窄、Inspector 下置；遵循深色图谱工作台视觉，不使用通用卡片墙；`:focus-visible` 明确。

- [ ] **Step 6: 验证 UI 编译与静态安全**

Run: `bun run build:arch-web`

Run: `bunx tsc --noEmit -p tools/arch-viewer/tsconfig.web.json`

Run: `rg 'https?://|innerHTML|eval\(' tools/arch-viewer/web`

Expected: 编译 PASS；搜索仅允许 `vscode://` 构造代码，不含 CDN、innerHTML 或 eval。

- [ ] **Step 7: 提交（仅获授权时）**

建议信息 `feat: 实现架构图谱工作台`。

---

### Task 4: 集成冒烟、门禁与文档收口

**Files:**

- Create: `tools/arch-viewer/test/integration.test.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-12-architecture-visualizer-design.md`
- Modify: `openspec/changes/architecture-visualizer-workbench-v1/tasks.md`
- Create or Modify: `doc/decisions/ADR-033-architecture-visualizer-fact-sources.md`（仅 ADR 检查确认有新决策时）

**Interfaces:**

- Produces: 可复查的端到端证据和使用文档。

- [ ] **Step 1: 写 HTTP + SSE + 前端资源集成测试**

Fake analyzer 启动真实 server：GET `/`、`app.js`、六 views、source；连接 SSE 后提交 V2 snapshot；断言事件版本 2，旧 V1 仍可在失败事件后读取。测试结束关闭全部句柄，无悬挂进程。

- [ ] **Step 2: 运行集成测试确认失败后修通**

Run: `bun test tools/arch-viewer/test/integration.test.ts`

Expected: 先因缺失接线 FAIL；完成真实 server/static/query/store 接线后 PASS。

- [ ] **Step 3: 更新 README**

在环境要求加入 CodeGraph CLI 1.5+；快速开始加入 `codegraph init` 由用户显式执行的前提与 `bun run arch`；门禁表加入 `test:arch`、`build:arch-web`；目录地图加入 `tools/arch-viewer`。不得声称工具会自动初始化索引。

```markdown
| `bun run arch` | 启动本地架构图谱工作台（需已初始化 `.codegraph`） | 否 |
| `bun run test:arch` | 架构分析、服务和前端纯函数测试 | 否 |
```

- [ ] **Step 4: 同步设计修订与 OpenSpec tasks**

设计稿确认 HTTP/SSE、`sync --quiet`、SourceScanner；OpenSpec tasks 全部按实现结果勾选。执行 ADR 检查：CodeGraph + SourceScanner 双事实源、选择 SSE 作为单向实时通道若构成长效决策，则创建 ADR-033；否则在 tasks.md 明确“无需新增 ADR”的依据。

- [ ] **Step 5: 运行完整门禁**

Run:

```powershell
openspec validate architecture-visualizer-workbench-v1 --strict
bun run typecheck
bun run typecheck:ci
bun run lint
bun run test:arch
bun run test
bun run arch --once --no-open
git diff --check
```

Expected: 全部退出码 0；once 摘要含 `views=6`；新增文件行数均 <=300；`package.json`/lockfile 无新增 package。

- [ ] **Step 6: 人工工作台验证**

Run: `bun run arch --no-open`

在输出 URL 验证：六导航可切换；Hierarchy 下钻；Dependencies 显示规则；搜索 `createBootFlow::launch`；Inspector 源码与 VS Code 链接；修改一个非关键 TS 注释后收到新 snapshot；制造配置锚点错误时旧图保留且 banner 报错。完成后 Ctrl+C，确认进程退出。

- [ ] **Step 7: 提交（仅获授权时）**

检查 status/diff，只暂存本计划相关文件；建议信息 `feat: 交付架构可视化工作台`。
