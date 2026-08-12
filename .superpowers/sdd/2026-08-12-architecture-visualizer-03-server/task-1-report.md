# Task 1 Report: 代次安全 GraphSnapshotStore

## 状态

DONE

## 改动

- 新增 `tools/arch-viewer/lib/server/snapshot-store.ts`。
- 导出 `AnalysisState`、`SnapshotEvent`、`SnapshotCurrent`、`GraphSnapshotStore` 与 `createGraphSnapshotStore`。
- 实现 `begin/commit/fail/current/subscribe`：
  - `begin` 递增 generation 并广播冻结的 `state-changed` 事件。
  - `commit` 仅接受当前 generation，成功后更新 last-known-good snapshot 并广播冻结的 `snapshot-ready` 事件。
  - `fail` 仅接受当前 generation，广播冻结的 `error` 事件，但保留 last-known-good snapshot。
  - `subscribe` 返回幂等（idempotent）dispose。
- 新增 `tools/arch-viewer/test/snapshot-store.test.ts`，覆盖代次竞争、失败保留快照、事件广播/冻结、dispose 幂等。

## TDD / 验证命令和结果

- RED: `bun test tools/arch-viewer/test/snapshot-store.test.ts`
  - 结果：FAIL，预期失败。
  - 失败原因：`Cannot find module '../lib/server/snapshot-store'`。
- GREEN: `bun test tools/arch-viewer/test/snapshot-store.test.ts`
  - 结果：PASS，4 tests，14 expect calls。
- TypeScript: `bun x tsc --noEmit -p tools/arch-viewer/tsconfig.json`
  - 结果：PASS，无输出。
- Whitespace: `git diff --check`
  - 结果：PASS，无输出。

## 自审

- 变更范围仅包含任务要求的新 store 与测试文件。
- 未引入依赖，未使用 `as any` 或 `@ts-ignore`。
- `commit/fail` 都按 generation 防止旧任务覆盖当前状态。
- `fail` 不清空 snapshot，满足 last-known-good 语义。
- 对外事件使用 `Object.freeze` 冻结；`current()` 返回只读冻结快照对象，但不深拷贝 `GraphSnapshot`，由现有 snapshot 冻结链路负责快照本身不可变。
- 新文件均小于 300 行。

## Concerns

- 暂无。
