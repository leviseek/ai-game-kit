# Task 5 Report

## 状态

DONE_WITH_CONCERNS

实现已完成并提交测试。单元级 analyzer 验证通过；真实仓库契约测试在当前隔离 worktree 上因 CodeGraph 索引绑定主 worktree 而明确失败，符合 brief 中“不隐藏 worktree mismatch”的要求。

## 改动

- 新增 `tools/arch-viewer/lib/analysis/analyzer.ts`：提供 `ArchitectureBuildInput` 与 `ArchitectureAnalyzer.buildSnapshot`，并发读取 `status/files` 与源码扫描，层次视图先于依赖视图，其它语义视图并发构建；默认 calls 视图聚焦 `createBootFlow::launch`。
- 新增 `tools/arch-viewer/lib/analysis/query-service.ts`：提供 `ArchitectureQueryService.project/view/group/search/neighborhood`，只返回快照查询结果，不读取源码，并复制数组边界避免泄漏可变集合。
- 增强 `tools/arch-viewer/lib/graph/snapshot.ts`：快照冻结从顶层数组扩展为深层冻结，满足分析总装配后的不可变契约。
- 新增 `tools/arch-viewer/test/fixtures/codegraph-fixture.ts`：fake gateway 与 fixture 文件/符号/调用关系，单元测试不依赖本机 CodeGraph。
- 新增 `tools/arch-viewer/test/analyzer.test.ts`：覆盖六个 view key、诊断聚合、深层冻结、逐字稳定输出、默认 calls anchor、QueryService 防御性返回。
- 新增 `tools/arch-viewer/test/repository-contract.test.ts`：真实仓库契约测试先 `gateway.sync()`，再检查配置 anchors、startup 节点、hierarchy 覆盖和 owner 唯一性；缺 `.codegraph` 或 worktree mismatch 明确失败。

## TDD / 验证命令和结果

- RED: `bun test tools/arch-viewer/test/analyzer.test.ts`
  - 结果：FAIL，预期失败。
  - 失败原因：`Cannot find module '../lib/analysis/analyzer'`，证明测试覆盖新增实现入口。
- GREEN: `bun test tools/arch-viewer/test/analyzer.test.ts`
  - 结果：PASS，`2 pass, 0 fail, 16 expect() calls`。
- `bun test tools/arch-viewer/test/analyzer.test.ts tools/arch-viewer/test/repository-contract.test.ts`
  - 结果：FAIL，`2 pass, 1 fail`。
  - 失败原因：`CodeGraph worktree mismatch: index=D:\ai-work\ai-game-kit, worktree=D:\ai-work\ai-game-kit\.worktrees\architecture-visualizer`。
  - 判断：不是实现问题；当前 `.codegraph` 索引来自主 worktree，契约测试按要求明确暴露环境问题。
- `bun x tsc --noEmit -p tools/arch-viewer/tsconfig.json`
  - 结果：PASS，无输出。
- `git diff --check`
  - 结果：PASS，无输出。

## 自审

- 分析器只消费 `CodeGraphGateway` 的结构化接口；未解析 CodeGraph 文本输出。
- 单元测试使用 fake gateway 和临时 fixture 文件，不依赖本机 CodeGraph。
- 层次视图先构建，再派生依赖视图；`status/files/source scan` 通过 Promise 管线并行启动。
- QueryService 未实现源码读取；`view/group/search/neighborhood` 均返回复制后的数组边界。
- 新增文件均少于 300 行；未使用 `as any` 或 `@ts-ignore`，未引入新依赖。

## Concerns

- 当前真实契约测试受本机 CodeGraph worktree mismatch 阻塞。需要为 `D:\ai-work\ai-game-kit\.worktrees\architecture-visualizer` 建立匹配索引后复跑。
- `tools/arch-viewer/tsconfig.json` 当前排除 `test/**/*.ts`，测试文件类型主要由 `bun test` 运行路径覆盖；未单独新增测试 tsconfig。
