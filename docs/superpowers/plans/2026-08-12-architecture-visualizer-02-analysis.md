# Architecture Visualizer Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 CodeGraph 公共 CLI 网关、TypeScript SourceScanner 和六类图分析器，产出确定性的完整 `GraphSnapshot`。

**Architecture:** CodeGraph 提供搜索、调用与 impact 事实；SourceScanner 提供静态声明和文件 import/export 事实；Analyzer 将两者与配置合并。每类图是独立纯投影，完整构建器负责并行取数、聚合诊断和稳定排序。

**Tech Stack:** TypeScript、Bun test、Node child_process、TypeScript Compiler API、CodeGraph CLI。

## Global Constraints

- 遵守 rollout 总计划及 Phase 1 固定接口。
- 单元测试默认使用 fake gateway，不依赖本机 CodeGraph；仅仓库契约测试访问真实索引。
- 不从 CodeGraph 文本输出解析源码；只消费 `--json` 命令。

---

### Task 1: CodeGraphGateway 公共 CLI 适配

**Files:**

- Create: `tools/arch-viewer/lib/codegraph/types.ts`
- Create: `tools/arch-viewer/lib/codegraph/process.ts`
- Create: `tools/arch-viewer/lib/codegraph/gateway.ts`
- Create: `tools/arch-viewer/lib/codegraph/errors.ts`
- Test: `tools/arch-viewer/test/codegraph-gateway.test.ts`

**Interfaces:**

- Produces: `CodeGraphNode`、`CodeGraphFile`、`CodeGraphRelationNode`、`CodeGraphStatus`。
- Produces: `CommandRunner(args, options): Promise<CommandResult>` 注入点。
- Produces: `CodeGraphGateway.status/sync/files/search/callers/callees/impact`。
- Produces: `resolveSymbol(ref: SymbolRef): Promise<CodeGraphNode | Diagnostic>`。

- [ ] **Step 1: 写 gateway 失败测试**

覆盖 `query` 多结果按 file 精确消歧、无 file 时多义报错、非零退出保留 stderr、超时归类、非法 JSON 归类。

```ts
test("resolveSymbol 用 file 消歧 qualifiedName", async () => {
    const gateway = createCodeGraphGateway(fakeRunner({ query: duplicateLaunchResults }));
    const result = await gateway.resolveSymbol({ name: "launch", file: "assets/boot/flow/BootFlow.ts" });
    expect("qualifiedName" in result && result.qualifiedName).toBe("createBootFlow::launch");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tools/arch-viewer/test/codegraph-gateway.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现异步进程与 DTO 校验**

使用 `execFile` promisify，默认 15s、16 MiB；`sync` 执行 `codegraph sync --quiet <root>`，其它命令加 `--json`。手写 shape guard，不引入 schema 依赖。查询优先 `qualifiedName` 精确匹配，再按 `filePath` 和 `name` 消歧。

```ts
async function runJson<T>(args: readonly string[], guard: (value: unknown) => value is T): Promise<T> {
    const result = await runner("codegraph", [...args, "--json"], limits);
    if (result.exitCode !== 0) throw new CodeGraphCommandError(args, result.stderr);
    const value: unknown = JSON.parse(result.stdout);
    if (!guard(value)) throw new CodeGraphJsonError(args);
    return value;
}
```

- [ ] **Step 4: 验证 gateway**

Run: `bun test tools/arch-viewer/test/codegraph-gateway.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交（仅获授权时）**

建议信息 `feat: 接入 CodeGraph 架构事实`。

---

### Task 2: TypeScript SourceScanner

**Files:**

- Create: `tools/arch-viewer/lib/analysis/source-scanner.ts`
- Create: `tools/arch-viewer/lib/analysis/module-resolver.ts`
- Test: `tools/arch-viewer/test/source-scanner.test.ts`

**Interfaces:**

- Produces: `ImportDependency { fromFile, toFile?, specifier, kind: "import" | "export", typeOnly, external }`。
- Produces: `SourceDeclaration { id, name, qualifiedName, kind, filePath, startLine, endLine, exported }`。
- Produces: `SourceScanResult { files, declarations, imports }`。
- Produces: `scanSources(projectRoot, files): SourceScanResult`。

- [ ] **Step 1: 创建临时 TS fixture 失败测试**

Fixture 包含 class/function/interface/type/method、嵌套函数、相对 import、`export ... from`、type-only import、目录 index、外部包和 `.meta` 邻接文件。断言声明具有稳定 qualifiedName/行号，依赖规范化为 `/` 路径，外部依赖不伪造仓库目标。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tools/arch-viewer/test/source-scanner.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现最小静态扫描**

用 `typescript.createSourceFile` 读取顶层和成员声明，以及 `ImportDeclaration` 与带 moduleSpecifier 的 `ExportDeclaration`；相对 specifier 按 `.ts/.tsx/.mts/.cts` 与 `/index.*` 解析。嵌套函数 qualifiedName 使用 `outer::inner`，成员使用 `Class::method`。忽略表达式、动态 import、require、声明文件、`.meta`、`node_modules`、third-party 和生成的 fairygui 库。

```ts
for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) {
        const specifier = statement.moduleSpecifier;
        if (specifier !== undefined && ts.isStringLiteral(specifier)) {
            imports.push(resolveDependency(file, specifier.text, statement));
        }
    }
}
collectDeclarations(sourceFile, file, declarations);
```

- [ ] **Step 4: 验证 scanner**

Run: `bun test tools/arch-viewer/test/source-scanner.test.ts`

Expected: PASS，输出按 `fromFile/toFile/specifier` 排序。

- [ ] **Step 5: 提交（仅获授权时）**

建议信息 `feat: 扫描 TypeScript 源码事实`。

---

### Task 3: 层次与依赖视图分析

**Files:**

- Create: `tools/arch-viewer/lib/analysis/hierarchy.ts`
- Create: `tools/arch-viewer/lib/analysis/dependencies.ts`
- Create: `tools/arch-viewer/lib/analysis/glob.ts`
- Test: `tools/arch-viewer/test/hierarchy-analysis.test.ts`
- Test: `tools/arch-viewer/test/dependency-analysis.test.ts`

**Interfaces:**

- Produces: `buildHierarchyView(config, files, symbols): GraphView`。
- Produces: `buildDependencyView(config, imports, hierarchy): GraphView`。
- Produces: `matchProjectGlob(path, pattern): boolean`，只支持配置所需 `*`、`**`、`{a,b}`。

- [ ] **Step 1: 写 hierarchy 失败测试**

断言 L0-L2 配置组、L3 目录/核心组件、L4 文件、L5 符号逐层 parentId 正确；未知文件进入 `unclassified` warning，而不是丢失。

- [ ] **Step 2: 写 dependency 失败测试**

用 `framework -> game` fixture 断言生成红色 error diagnostic；允许的 `game -> framework` 聚合为一条 edge，evidence 保留全部源文件；带原因 exception 降为 info。

- [ ] **Step 3: 运行测试确认失败**

Run: `bun test tools/arch-viewer/test/hierarchy-analysis.test.ts tools/arch-viewer/test/dependency-analysis.test.ts`

Expected: FAIL。

- [ ] **Step 4: 实现 hierarchy 与依赖聚合**

同一 `fromGroup/toGroup/relation` 合并一条边；type-only import 仍显示但 metadata 标记；self edge 默认省略。层次 L5 使用 SourceScanner declarations，CodeGraph 搜索结果只用于精确查询和调用关系。层次节点 metadata 写入 childCount、fileCount、symbolCount、testCount。

```ts
for (const dependency of imports) {
    const from = ownership.get(dependency.fromFile);
    const to = dependency.toFile === undefined ? undefined : ownership.get(dependency.toFile);
    if (from === undefined || to === undefined || from === to) continue;
    mergeDependencyEdge(edges, from, to, dependency);
}
```

- [ ] **Step 5: 验证两视图**

Run: `bun test tools/arch-viewer/test/hierarchy-analysis.test.ts tools/arch-viewer/test/dependency-analysis.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交（仅获授权时）**

建议信息 `feat: 生成架构层次与依赖视图`。

---

### Task 4: 启动、数据流、调用与资源视图

**Files:**

- Create: `tools/arch-viewer/lib/analysis/semantic-path.ts`
- Create: `tools/arch-viewer/lib/analysis/startup.ts`
- Create: `tools/arch-viewer/lib/analysis/data-flow.ts`
- Create: `tools/arch-viewer/lib/analysis/calls.ts`
- Create: `tools/arch-viewer/lib/analysis/resources.ts`
- Test: `tools/arch-viewer/test/semantic-views.test.ts`

**Interfaces:**

- Produces: `resolveConfiguredPath(gateway, anchors): Promise<ResolvedSemanticPath>`。
- Produces: `buildStartupView`、`buildDataFlowView`、`buildCallView`、`buildResourceView`。

- [ ] **Step 1: 写语义视图失败测试**

Fake gateway 返回真实形状：startup 装配 phase 可解析，`AppRoot::start` 的 Application/presentation 两 branch 各自有 caller/callee 证据，禁止生成 `Application::start -> createBootFlow::launch` 假边；CloseDialog flow 中 UI click 到 reducer 是 `declared`，Store/project/onState 有代码证据；resource L0/L1 owner/scope metadata 保留；call view 把测试文件标记 `role: "test"`。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tools/arch-viewer/test/semantic-views.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现受限路径解析**

每个 anchor 先 `resolveSymbol`；相邻 anchor 只查询一到两跳 callers/callees，不做全图遍历。未找到证据时保留配置边并置 `declared: true`，同时生成 warning；歧义/缺失是 error。

```ts
const evidence = await findDirectOrTwoHopPath(gateway, from.node, to.node);
edges.push({
    ...semanticEdge(from.node.id, to.node.id),
    evidence,
    declared: evidence.length === 0,
});
```

- [ ] **Step 4: 实现四视图投影**

Startup metadata 包含 phase/branch；DataFlow 包含 lane/direction；Calls 包含 incoming/outgoing/affected role；Resources 包含 level/owner/scope/state。所有边保留 evidence，排序确定。

- [ ] **Step 5: 验证语义视图**

Run: `bun test tools/arch-viewer/test/semantic-views.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交（仅获授权时）**

建议信息 `feat: 生成架构语义与调用视图`。

---

### Task 5: 完整 ArchitectureAnalyzer 与真实仓库契约

**Files:**

- Create: `tools/arch-viewer/lib/analysis/analyzer.ts`
- Create: `tools/arch-viewer/lib/analysis/query-service.ts`
- Create: `tools/arch-viewer/test/fixtures/codegraph-fixture.ts`
- Test: `tools/arch-viewer/test/analyzer.test.ts`
- Test: `tools/arch-viewer/test/repository-contract.test.ts`

**Interfaces:**

- Produces: `ArchitectureBuildInput { readonly version: number }`。
- Produces: `ArchitectureAnalyzer.buildSnapshot(input: ArchitectureBuildInput): Promise<GraphSnapshot>`。
- Produces: `ArchitectureQueryService.project/view/group/search/neighborhood`；源码读取留在 server 层。

- [ ] **Step 1: 写完整 snapshot 失败测试**

Fake gateway + fixture files/imports 构建后断言六个 view key 全部存在、诊断聚合、snapshot 深层冻结、同 fixture 输出逐字稳定。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tools/arch-viewer/test/analyzer.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 analyzer 与 query service**

并行读取 `status/files` 与 source scan；层次先于其它视图；默认 calls view 聚焦 `createBootFlow::launch`。QueryService 不泄漏可变数组。

```ts
export interface ArchitectureBuildInput {
    readonly version: number;
}

export interface ArchitectureQueryService {
    project(): ProjectSummary;
    view(type: ViewType): GraphView;
    group(id: string): GraphView | undefined;
    search(query: string): readonly GraphNode[];
    neighborhood(id: string): GraphView | undefined;
}
```

- [ ] **Step 4: 写真实仓库契约测试**

测试先执行 `gateway.sync()`，再断言配置 anchor 全部可解析；startup 至少包含 `AppRoot::onLoad`、`assembleApp`、`createBootFlow::launch`、`createSceneFlow::switchTo`；hierarchy 覆盖目标 `assets/tools` TS 文件且无重复 owner。

- [ ] **Step 5: 运行分析阶段门禁**

Run: `bun test tools/arch-viewer/test/analyzer.test.ts tools/arch-viewer/test/repository-contract.test.ts`

Run: `bunx tsc --noEmit -p tools/arch-viewer/tsconfig.json`

Expected: PASS；真实契约测试若无 `.codegraph` 应以明确错误失败，不跳过。

- [ ] **Step 6: 提交（仅获授权时）**

建议信息 `feat: 完成架构快照分析内核`。
