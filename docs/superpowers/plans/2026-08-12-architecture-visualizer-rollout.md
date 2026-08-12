# Architecture Visualizer Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 `bun run arch` 本地实时架构工作台，以六类图展示当前仓库的层次、启动、依赖、数据流、调用影响与资源生命周期。

**Architecture:** `tools/arch-viewer` 以 CodeGraph 公共 CLI 提供符号调用事实，以 TypeScript Compiler API 提供静态声明和 import/export 事实，以类型化配置补充项目语义；分析内核生成不可变 `GraphSnapshot`。Node 内置 HTTP + SSE 提供只读 API，原生 TypeScript/HTML/CSS/SVG 前端进行确定性布局和交互。

**Tech Stack:** TypeScript 5.9 strict、Bun 1.x、Node.js built-ins、CodeGraph CLI 1.5+、TypeScript Compiler API、HTML/CSS/SVG、OpenSpec。

## Global Constraints

- 注释使用简体中文；标识符、API 名、错误消息和路径保持英文。
- 不引入第三方运行时、前端、图形或布局依赖；复用根 `typescript` devDependency。
- 新增源码与计划文件均不得超过 300 行；超过时按职责拆分。
- 不读取 `.codegraph/codegraph.db`，不自动执行 `codegraph init` 或 `codegraph index`。
- CodeGraph 负责 query/callers/callees/impact；SourceScanner 只解析静态声明和 `import/export`，不推断调用。
- 服务只绑定 `127.0.0.1`，只暴露读取与 SSE；无源码编辑、命令执行或远程访问 API。
- 分析失败保留最后一次成功快照；旧分析代次不得覆盖新快照。
- 浏览器 UI 使用原生 ES modules；不增加 bundler。`tsconfig.web.json` 编译到 `temp/arch-viewer/web/`。
- `.meta`、Cocos 发布产物、FGUI XML/`.bin`/atlas 均不属于本计划范围。
- 实现前创建独立 OpenSpec change；完成前执行 ADR 检查，并同步本设计稿的 SSE/SourceScanner 修订。
- 所有提交步骤仅在用户明确授权 Git 提交时执行。

---

## Plan Map

1. [OpenSpec、workspace 与图模型基础](./2026-08-12-architecture-visualizer-01-foundation.md)
2. [CodeGraph、SourceScanner 与六视图分析](./2026-08-12-architecture-visualizer-02-analysis.md)
3. [快照、watcher、HTTP/SSE 与 CLI](./2026-08-12-architecture-visualizer-03-server.md)
4. [SVG 工作台、集成验证与文档收口](./2026-08-12-architecture-visualizer-04-workbench.md)

## Dependency Order

```text
OpenSpec + workspace
  -> graph/config contracts
  -> CodeGraphGateway + SourceScanner
  -> hierarchy/dependency analyzer
  -> startup/data-flow/calls/resource analyzer
  -> GraphSnapshotStore + ProjectWatcher
  -> HTTP/SSE API + arch CLI
  -> web state + six deterministic layouts
  -> SVG shell + inspector + VS Code links
  -> repository contract + full gates + ADR/docs
```

## Locked Cross-Plan Interfaces

- `ArchitectureConfig`、`GraphNode`、`GraphEdge`、`GraphGroup`、`Diagnostic`、`GraphSnapshot` 定义在 Phase 1，后续阶段不得另建同义类型。
- `CodeGraphGateway` 只返回解析后的公共 CLI DTO；Analyzer 不执行子进程。
- `scanSources(projectRoot, files): SourceScanResult` 返回静态声明和文件依赖事实。
- `ArchitectureBuildInput { readonly version: number }` 与 `ArchitectureAnalyzer.buildSnapshot(input: ArchitectureBuildInput): Promise<GraphSnapshot>` 是服务端完整重建入口。
- `ArchitectureQueryService.project/view/group/search/neighborhood` 是 HTTP 与未来 MCP 的只读图查询接口；源码 IO 只在 server 层。
- 实时事件统一为 SSE `snapshot-ready | analysis-error | index-waiting`。

## Completion Gate

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

Expected: 全部退出码为 0；`--once` 输出一个包含六类 view 的成功快照摘要；无新增依赖；所有新增文件不超过 300 行。

## Self-Review

- Spec coverage: 六类图、配置语义、CodeGraph/SourceScanner 边界、实时刷新、SSE、只读 API、VS Code 跳转、错误保留、安全与测试均有子计划。
- Scope: 不实现 MCP、通用仓库、远程访问、代码编辑、力导向布局或新 CI 架构阻断。
- Type consistency: 四个子计划统一使用 `GraphSnapshot`、`ArchitectureAnalyzer`、`ArchitectureQueryService`、`SnapshotEvent`；实时通道统一为 SSE。
