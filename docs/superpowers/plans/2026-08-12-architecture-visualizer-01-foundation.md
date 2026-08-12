# Architecture Visualizer Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建 OpenSpec change、独立 workspace、统一图模型与类型安全项目配置，为后续分析和服务提供稳定接口。

**Architecture:** 本阶段不读取真实 CodeGraph，也不启动网页。先用纯数据类型、配置 builder 和 fixture 锁定六视图共享模型及配置诊断语义。

**Tech Stack:** OpenSpec、TypeScript 5.9 strict、Bun test、Node types。

## Global Constraints

- 遵守 rollout 总计划全部约束。
- 不添加业务运行时代码或 assets 依赖。
- 本阶段所有测试均为纯 TypeScript fixture，不要求 CodeGraph 可用。

---

### Task 1: 创建 OpenSpec change 与 workspace 门禁

**Files:**
- Create: `openspec/changes/architecture-visualizer-workbench-v1/proposal.md`
- Create: `openspec/changes/architecture-visualizer-workbench-v1/design.md`
- Create: `openspec/changes/architecture-visualizer-workbench-v1/tasks.md`
- Create: `openspec/changes/architecture-visualizer-workbench-v1/specs/architecture-visualization/spec.md`
- Create: `tools/arch-viewer/package.json`
- Create: `tools/arch-viewer/tsconfig.json`
- Create: `tools/arch-viewer/tsconfig.web.json`
- Create: `tools/arch-viewer/cli.ts`
- Create: `tools/arch-viewer/web/bootstrap.ts`
- Modify: `package.json`
- Test: `tools/arch-viewer/test/workspace.test.ts`

**Interfaces:**
- Produces: workspace scripts `arch`, `test:arch`, `build:arch-web`。
- Produces: 最小 CLI `run(argv: readonly string[]): Promise<number>`：`--help` 返回 0；服务模式在 Phase 3 接线前返回明确错误和退出码 1。

- [ ] **Step 1: 使用 `openspec-propose` 创建 change**

Proposal 必须固定：六类图、CodeGraph 公共 CLI、TypeScript SourceScanner（静态声明 + import/export）、SSE、零新增依赖、首版无 MCP。`tasks.md` 末尾加入 ADR 检查。

- [ ] **Step 2: 校验 OpenSpec**

Run: `openspec validate architecture-visualizer-workbench-v1 --strict`

Expected: PASS，0 errors。

- [ ] **Step 3: 写 workspace 失败测试**

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");

describe("arch-viewer workspace", () => {
    test("根脚本接入 arch workspace", () => {
        const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
            workspaces: string[];
            scripts: Record<string, string>;
        };
        expect(pkg.workspaces).toContain("tools/arch-viewer");
        expect(pkg.scripts.arch).toBe("bun ./tools/arch-viewer/cli.ts");
        expect(pkg.scripts["test:arch"]).toBe("bun test ./tools/arch-viewer/test");
    });
});
```

- [ ] **Step 4: 运行测试确认失败**

Run: `bun test tools/arch-viewer/test/workspace.test.ts`

Expected: FAIL，workspace 或脚本不存在。

- [ ] **Step 5: 创建 package、tsconfig 与最小 CLI**

`package.json` 使用 `type: "module"`，声明仓库已有版本的 `typescript` 与 `@types/node` devDependency，不引入新 package；`tsconfig.json` 覆盖 `cli.ts`、`lib/**`、`architecture.config.ts`；`tsconfig.web.json` 使用 `lib: ["ES2022", "DOM"]`、`rootDir: "."`、`outDir: "../../temp/arch-viewer"`，include `web/**/*.ts` 与共享 `lib/graph/types.ts`。根 `typecheck/typecheck:ci` 追加 arch-viewer 两个 tsconfig，根 `test` 追加 `test:arch`。

```json
{
  "scripts": {
    "arch": "bun ./tools/arch-viewer/cli.ts",
    "build:arch-web": "tsc -p tools/arch-viewer/tsconfig.web.json",
    "test:arch": "bun test ./tools/arch-viewer/test"
  }
}
```

```ts
export async function run(argv: readonly string[]): Promise<number> {
    if (argv.includes("--help")) {
        console.log("arch [--port <number>] [--no-open] [--once]");
        return 0;
    }
    console.error("arch server is not available yet");
    return 1;
}
```

`web/bootstrap.ts` 保证 Phase 1 的 web tsconfig 有输入文件；共享图类型在 Task 2 创建后再由 Phase 4 的 `web/types.ts` 重导出：

```ts
export {};
```

- [ ] **Step 6: 验证 workspace**

Run: `bun test tools/arch-viewer/test/workspace.test.ts`

Run: `bun run typecheck:ci`

Expected: PASS；CLI `bun run arch --help` 退出码 0。

- [ ] **Step 7: 提交（仅获授权时）**

只暂存本 Task 文件；建议信息 `feat: 建立架构可视化 workspace`。

---

### Task 2: 定义统一图模型

**Files:**
- Create: `tools/arch-viewer/lib/graph/types.ts`
- Create: `tools/arch-viewer/lib/graph/ids.ts`
- Create: `tools/arch-viewer/lib/graph/snapshot.ts`
- Test: `tools/arch-viewer/test/graph-model.test.ts`

**Interfaces:**
- Produces: `ViewType = "hierarchy" | "startup" | "dependencies" | "data-flow" | "calls" | "resources"`。
- Produces: `SourceLocation`、`Evidence`、`GraphNode`、`GraphEdge`、`GraphGroup`、`Diagnostic`、`GraphView`、`GraphSnapshot`。
- Produces: `createNodeId(kind, filePath, qualifiedName): string`、`createEdgeId(from, to, relation): string`、`freezeSnapshot(input): GraphSnapshot`。

- [ ] **Step 1: 写不可变与稳定 id 失败测试**

```ts
test("相同源码位置生成稳定 id，快照深层冻结", () => {
    const id = createNodeId("function", "assets/a.ts", "createA::run");
    expect(id).toBe(createNodeId("function", "assets/a.ts", "createA::run"));
    const snapshot = freezeSnapshot({ version: 1, generatedAt: 1, project: fixtureProject, views: fixtureViews, diagnostics: [] });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.views.hierarchy.nodes)).toBe(true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tools/arch-viewer/test/graph-model.test.ts`

Expected: FAIL，类型/函数不存在。

- [ ] **Step 3: 实现最小图模型**

`GraphView` 固定 `{ type, rootGroupId?, nodes, edges, groups, diagnostics }`；`GraphSnapshot.views` 为六 key 的 `Readonly<Record<ViewType, GraphView>>`。id 使用可读的 URL-safe 拼接，不引入 hash 依赖；排序由调用方提供，`freezeSnapshot` 复制数组后冻结。

```ts
export function createNodeId(kind: string, filePath: string, qualifiedName: string): string {
    return [kind, filePath, qualifiedName].map(encodeURIComponent).join(":");
}

export function freezeSnapshot(input: GraphSnapshot): GraphSnapshot {
    for (const view of Object.values(input.views)) {
        Object.freeze(view.nodes);
        Object.freeze(view.edges);
        Object.freeze(view.groups);
        Object.freeze(view.diagnostics);
        Object.freeze(view);
    }
    Object.freeze(input.views);
    Object.freeze(input.diagnostics);
    Object.freeze(input.project);
    return Object.freeze(input);
}
```

- [ ] **Step 4: 验证模型**

Run: `bun test tools/arch-viewer/test/graph-model.test.ts`

Run: `bunx tsc --noEmit -p tools/arch-viewer/tsconfig.json`

Expected: PASS。

- [ ] **Step 5: 提交（仅获授权时）**

建议信息 `feat: 定义架构图快照模型`。

---

### Task 3: 定义并校验架构配置

**Files:**
- Create: `tools/arch-viewer/lib/config/types.ts`
- Create: `tools/arch-viewer/lib/config/builders.ts`
- Create: `tools/arch-viewer/lib/config/validate.ts`
- Create: `tools/arch-viewer/architecture.config.ts`
- Test: `tools/arch-viewer/test/config.test.ts`

**Interfaces:**
- Produces: `SymbolRef { readonly name: string; readonly file?: string }`。
- Produces: `HierarchyGroupConfig`、`DependencyRuleConfig`、`StartupConfig`、`StartupBranchConfig`、`SemanticFlowConfig`、`ResourceLifecycleConfig`、`ArchitectureConfig`。
- Produces builders: `symbol`、`group`、`allow`、`deny`、`phase`、`branch`、`flow`、`lifecycle`、`defineArchitectureConfig`。
- Produces: `validateArchitectureConfig(config): readonly Diagnostic[]`。

- [ ] **Step 1: 写配置校验失败测试**

```ts
test("拒绝重复 group、未知依赖 group 与无原因例外", () => {
    const config = defineArchitectureConfig({
        hierarchy: { root: group("root", [group("a", ["assets/a/**"]), group("a", ["assets/b/**"])]) },
        dependencyRules: [allow("a", ["missing"], { exception: true, reason: "" })],
        startup: { entry: symbol("AppRoot::onLoad", "assets/boot/AppRoot.ts"), phases: [], branches: [] },
        dataFlows: [],
        resources: [],
    });
    expect(validateArchitectureConfig(config).map((item) => item.rule)).toEqual([
        "config.duplicate-group",
        "config.unknown-group",
        "config.exception-reason",
    ]);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tools/arch-viewer/test/config.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 builder 与纯校验**

配置对象全部冻结；group id 在全树唯一；未知 dependency group、空 branch、重复 lane、空锚点名和无原因 exception 产生 error diagnostic。实际文件同时命中多个 leaf group 的 ownership overlap 由 Analyzer 在拿到文件清单后诊断。

```ts
export function defineArchitectureConfig(config: ArchitectureConfig): ArchitectureConfig {
    return Object.freeze(config);
}

export function symbol(name: string, file?: string): SymbolRef {
    return Object.freeze(file === undefined ? { name } : { name, file });
}
```

- [ ] **Step 4: 写真实仓库配置**

Hierarchy 至少覆盖 `assets/boot/**`、`assets/framework/{core,contracts,application,diagnostics,adapters,libs}/**`、framework 根 TS 文件、`assets/game/**`、`assets/samples/**`、`assets/{ui,audio,common,game-content,resources}/**`、`tools/{creator,fgui,fgui-mcp,arch-viewer}/**`。Startup 以 `AppRoot::onLoad` 为装配入口，并从 `AppRoot::start` 分成 Application 与 presentation 两个 branch；后者包含 `createBootFlow::launch`、`createSceneFlow::switchTo`、`UiHost::init`。Data flow 使用 CloseDialog 的 `bind/_handleConfirm/closeDialogReducer/projectCloseDialog/onState`；resource flow 使用 `UiHost::loadPackage/release` 与 `createSceneFlow::preload/switchTo/currentFlowScope`。

- [ ] **Step 5: 验证配置**

Run: `bun test tools/arch-viewer/test/config.test.ts`

Run: `bunx tsc --noEmit -p tools/arch-viewer/tsconfig.json`

Expected: PASS，真实配置的纯结构诊断为空。

- [ ] **Step 6: 提交（仅获授权时）**

建议信息 `feat: 声明架构可视化项目语义`。
