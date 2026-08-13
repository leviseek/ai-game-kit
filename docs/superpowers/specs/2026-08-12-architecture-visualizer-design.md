# Architecture Visualizer Design

## 1. Background

`ai-game-kit` 已有明确的 framework 边界、ADR、边界测试、Bun CLI 工具链和仓库级
CodeGraph 索引，但缺少从当前代码实时探索启动编排、架构层次、依赖方向、Feature 数据流、
符号调用与资源所有权的交互式入口。静态 Mermaid 继续承载长期决策；本工具负责可搜索、可下钻、
有源码证据的当前事实。首要用户是开发者，因此首版交付本地网页；未来只读 MCP 复用同一分析内核。

## 2. Goals And Non-goals

目标：

- 通过 `bun run arch` 启动与源码同步的本地架构工作台。
- 提供六张相互联动的图：架构层次、启动流程、模块依赖、数据流、符号调用、资源生命周期。
- CodeGraph 作为文件、符号、caller/callee 和 impact 的事实权威。
- 小型类型化配置补充无法可靠推断的稳定项目语义。
- 从项目逐层下钻到符号，显示源码证据、诊断，并跳转 VS Code。
- 分析失败时保留最后一次成功快照。
- 不新增第三方运行时、前端、图形或布局依赖。

非目标：

- 首版不实现 MCP，不支持其它仓库或非 TypeScript 项目。
- 不读取 CodeGraph 私有 SQLite，不替代 VS Code，不实现通用力导向布局。
- 可视化违规暂不成为新 CI 阻断门禁，不自动修改代码、配置、ADR 或文档。

## 3. Chosen Approach

新增 `tools/arch-viewer` workspace，包含可复用分析内核、Bun 本地服务和原生
TypeScript/HTML/CSS/SVG 前端。启动分析前显式执行 CodeGraph 公共 CLI `sync --quiet`，符号调用只使用 JSON 输出的
`status`、`files`、`query`、`callers`、`callees`、`impact`，不依赖数据库内部结构。由于公共 CLI 不提供
全量依赖边和文件内符号导出，`SourceScanner` 另以 TypeScript Compiler API 解析静态 `import/export`
与声明名称/kind/源码位置，用于模块依赖和层次 L5；它不推断函数调用。

前端不引入图形库。六类图各用确定性布局：层次图用可展开树，启动图用阶段泳道，依赖图用分层
DAG，数据流用固定架构泳道，调用图用中心式入边/出边布局，资源图用所有权泳道和生命周期状态。

## 4. System Architecture

```text
CodeGraph CLI + TypeScript SourceScanner + architecture.config.ts
  -> CodeGraphGateway + config validation
  -> ArchitectureAnalyzer
  -> immutable GraphSnapshot
  -> ArchServer HTTP / SSE
  -> WorkbenchFrontend SVG projection
```

组件职责：

- `CodeGraphGateway`：以 `execFile` 参数数组执行 CLI，校验 JSON，归一超时、缺失命令、无索引、
  多义符号和非法输出；提供可由 fixture 替换的窄接口。
- `SourceScanner`：使用现有 TypeScript Compiler API 解析静态 `import/export` 和声明节点，生成全局
  文件依赖与层次符号事实；不扫描调用表达式，不替代 CodeGraph。
- `ArchitectureConfig`：声明 L0-L2 层次、依赖规则与例外、启动阶段、数据流泳道/锚点、资源层级/
  owner/scope/锚点；不复制调用图。
- `ArchitectureAnalyzer`：合并代码事实与项目语义，聚合依赖、解析锚点、寻找证据路径、生成诊断、
  根视图、展开组和局部子图。
- `GraphSnapshotStore`：持有最后一次成功的不可变快照，以分析代次拒绝旧结果覆盖新结果。
- `ProjectWatcher`：监听相关代码、配置和架构文档，debounce 后等待 CodeGraph 同步；最多一个分析任务，
  后续变化合并为下一代。
- `ArchServer`：使用 Node 内置 HTTP 与 Server-Sent Events（SSE）单向通道，绑定 `127.0.0.1`，提供静态资源和只读 API。
- `WorkbenchFrontend`：统一维护图型、筛选、搜索、下钻、缩放和选中状态；只消费图模型，不解析源码。

分析层不依赖 HTTP/SVG，服务端不计算布局，前端不执行 CodeGraph。未来 MCP 直接适配分析查询接口。

## 5. Unified Graph Model

六类图共享基础快照：

```ts
interface GraphNode {
    readonly id: string;
    readonly kind: NodeKind;
    readonly label: string;
    readonly source?: SourceLocation;
    readonly groupId?: string;
    readonly metadata: Readonly<Record<string, unknown>>;
}

interface GraphEdge {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly relation: EdgeRelation;
    readonly evidence: readonly Evidence[];
    readonly declared: boolean;
}

interface GraphGroup {
    readonly id: string;
    readonly kind: "project" | "system" | "layer" | "module" | "directory";
    readonly label: string;
    readonly parentId?: string;
    readonly childIds: readonly string[];
}

interface Diagnostic {
    readonly severity: "info" | "warning" | "error";
    readonly rule: string;
    readonly message: string;
    readonly nodeIds: readonly string[];
    readonly evidence: readonly Evidence[];
}
```

语义边必须有 CodeGraph 证据，或显式标记 `declared`；Inspector 明确区分两者。输出稳定排序，便于测试。

## 6. The Six Views

### 6.1 Architecture Hierarchy

回答“系统由什么组成、每个组件归属哪里”。层级为 L0 项目；L1 Boot、Framework、Game and
Samples、Tooling；L2 Core、Contracts、Application、Adapters 等稳定子系统；L3 模块/核心组件；
L4 文件；L5 符号。L0-L2 来自配置，L3-L5 结合目录与 CodeGraph 自动展开。节点显示职责摘要、子项数、
公开入口和相关测试，可跳到依赖图或调用图。它表达包含/所有权，不与依赖图合并。

### 6.2 Startup Flow

回答“Cocos 入口如何装配应用，并沿哪些分支到达运行态和首个可交互 UI”。当前真实路径为：

```text
AppRoot.onLoad -> assembleApp + createBootFlow
AppRoot.start
  |-> validate/bind -> Application.start
  `-> BootFlow.launch -> preload -> SceneFlow.switchTo("game")
        -> UiHost.init -> game feature activation
```

CodeGraph 提供真实调用路径和源码位置；配置提供阶段名、分支含义、smoke/default 区分和关键状态。

### 6.3 Module Dependencies

回答“各层、目录、文件和符号依赖谁，方向是否合法”。CodeGraph 关系按当前展开层级聚合；配置定义层
归属、允许方向和带 `reason` 的例外。违规以红边显示规则、证据和源码位置；现有边界测试仍是执行权威。

### 6.4 Data Flow

回答“用户或系统意图如何成为可见 UI 状态”。初始泳道遵循项目 MVVM/Store 约束：

```text
View / FuiView -> Application facade / Use Case -> Domain + Ports
  -> Action -> Feature Store / reducer -> pure ViewModel projection -> FuiView.onState
```

配置声明角色、锚点及成功/失败回路；CodeGraph 验证锚点并给出路径。缺失、多义或不连通均产生诊断。

### 6.5 Symbol Calls And Impact

回答“谁调用它、它调用谁、改动会影响哪里”。完全来自 CodeGraph callers/callees/impact，无项目语义
配置。中心为选中符号，入边侧显示 callers/测试，出边侧显示 callees/affected；默认仅一到两跳。

### 6.6 Resource Lifecycle

回答“谁加载、持有、释放和卸载资源”。初始语义为 L0 Common/config 应用常驻，L1 SceneFlow 场景
资源，L2 Feature/会话 scope，L3 不预加载。配置声明 level、owner、scope 和生命周期锚点，CodeGraph
补充真实调用证据；布局显示 load、retain、active、release、unload。

## 7. Configuration Contract

`tools/arch-viewer/architecture.config.ts` 与 workspace 一起类型检查。示意：

```ts
export default defineArchitectureConfig({
    hierarchy: {
        root: group("ai-game-kit", [
            group("boot", ["assets/boot/**"]),
            group("framework", [
                "assets/framework/*.ts",
                group("core", ["assets/framework/core/**"]),
                group("contracts", ["assets/framework/contracts/**"]),
                group("application", ["assets/framework/application/**"]),
                group("diagnostics", ["assets/framework/diagnostics/**"]),
                group("adapters", ["assets/framework/adapters/**"]),
                group("libraries", ["assets/framework/libs/**"]),
            ]),
            group("game", ["assets/game/**", "assets/samples/**", "assets/ui/**", "assets/audio/**", "assets/common/**", "assets/game-content/**", "assets/resources/**"]),
            group("tooling", ["tools/**"]),
        ]),
    },
    dependencyRules: [allow("boot", ["framework", "game"]), allow("game", ["framework"]), deny("framework", ["boot", "game"])],
    startup: {
        entry: symbol("AppRoot::onLoad", "assets/boot/AppRoot.ts"),
        phases: [phase("assembly", ["assembleApp", "createBootFlow"])],
        branches: [branch("application", ["AppRoot::start", "Application::start"]), branch("presentation", ["AppRoot::start", "createBootFlow::launch", "createSceneFlow::switchTo", "UiHost::init"])],
    },
    dataFlows: [],
    resources: [],
});
```

符号引用由名称和可选文件路径消歧；无文件限定的多义符号报错。依赖例外必须有非空原因。配置的重叠
所有权、未知 group、非法锚点、阶段不连通均产生结构化诊断。稳定人工分组止于 L2，低层尽量自动生成。

## 8. Workbench Interaction

选定布局为左侧六类图导航、中间统一 SVG 画布、右侧 Inspector、顶部搜索和快照状态。全局搜索按
kind/path 消歧；单击聚焦一到两跳，双击从 system/layer 下钻到目录、文件、符号；面包屑逐级返回。
Inspector 显示源码、关系、证据和诊断，并通过经过服务端验证的
`vscode://file/{absolutePath}:{line}:{column}` 打开源码。跨层次图、依赖图、调用图切换时尽量保留实体。
支持平移、缩放、适配、重置和可访问标签；窄屏将 Inspector 堆叠到画布下方。

## 9. Local API

- `GET /api/project`：当前快照的项目摘要。
- `GET /api/views/:type`：`hierarchy | startup | dependencies | data-flow | calls | resources`。
- `GET /api/groups/:id`：展开 hierarchy/aggregation group。
- `GET /api/symbols/search?q=`：搜索符号、文件和 group。
- `GET /api/nodes/:id/neighborhood`：局部调用或 impact 子图。
- `GET /api/source?file=&line=&radius=`：仅允许读取当前快照节点 location allowlist 中的仓库内有界源码片段。
- `GET /api/events`（SSE）：`state-changed`、`snapshot-ready`、`error`。

传输类型直接使用可序列化图模型，不另建一套重复 schema。

## 10. Refresh, Errors And Security

变化经 debounce 形成代次，等待 CodeGraph 同步后分析；成功且仍是最新代次才替换快照并广播。一个时刻
最多一个分析任务，分析中发生的变化合并为下一代。前端刷新时保留图型、筛选、展开路径和焦点；焦点
消失则退回最近父级并提示。失败保留旧快照并显示错误。

服务只绑定 `127.0.0.1`；文件读取必须位于解析后的仓库根内，拒绝路径穿越，并额外受快照 source allowlist 限制。CodeGraph 使用
`execFile`、超时和输出上限。未安装命令、缺少 `.codegraph`、pendingChanges 非零或 worktree mismatch 时明确失败，不自动 `init/index`。
分别诊断 executable、index、sync、JSON、config、analysis 错误。无写操作、命令执行、远程访问或源码编辑 API。

## 11. Testing And Gates

- 分析内核：层次所有权/L0-L5 展开、依赖聚合、边去重、规则/例外、锚点消歧与连通、局部影响图、
  确定性排序。
- Gateway：各 CLI JSON、非零退出、stderr、缺命令/索引、超时、输出上限、重名、非法 JSON。
- Snapshot/watcher：debounce、单任务、旧代次拒绝、失败保留、版本与 SSE 通知。
- Server：全部只读路由、未知实体、路径穿越、有界源码、SSE 事件。
- Frontend：六类布局、搜索/筛选/下钻、刷新保留、焦点回退、VS Code 链接、窄屏布局。
- 仓库契约：层次配置覆盖目标 `assets/tools` 且无重叠；启动阶段可解析并连通；数据流/资源锚点可解析
  或产生被测试明确接受的诊断。

新增 `test:arch`，并把 workspace 纳入根 `typecheck`、`test`、`verify`。

## 12. Files, Commands And Future Extension

```text
tools/arch-viewer/
  architecture.config.ts
  cli.ts
  package.json
  lib/{codegraph,analysis,config,graph,server}/
  web/{index.html,app.ts,styles.css,views/}
  test/
```

新增源码文件均不超过 300 行。根命令为 `bun run arch` 与 `bun run test:arch`；`arch` 默认打开浏览器，
`--no-open` 禁止自动打开。

未来 OpenSpec change 可增加列图、搜索、局部子图和导出 Mermaid/SVG/JSON 的只读 MCP adapter；它必须
复用同一分析内核和快照接口。只有第二个真实 TypeScript 仓库验证复用价值后，才抽象通用项目配置。
