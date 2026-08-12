# Task 4 Report

## 状态

DONE

## 改动

- 新增 `tools/arch-viewer/lib/analysis/semantic-path.ts`：实现 `resolveConfiguredPath`，每个 anchor 先经 `resolveSymbol` 解析，相邻 anchor 只检查直接与两跳 callers/callees 证据；无证据时保留 declared 边并生成 warning；缺失/歧义诊断提升为 error。
- 新增 `tools/arch-viewer/lib/analysis/startup.ts`：实现 `buildStartupView`，按 startup phase/branch 投影节点与边 metadata，并避免跨 branch 串联生成假边。
- 新增 `tools/arch-viewer/lib/analysis/data-flow.ts`：实现 `buildDataFlowView`，按 flow lane 和 anchor 顺序标注 `lane`、`direction`，相邻 lane 用 declared/code evidence 连接。
- 新增 `tools/arch-viewer/lib/analysis/calls.ts`：实现 `buildCallView`，基于 anchor 的 callers/callees/impact 构造 incoming/outgoing/affected 视图，测试文件标记 `role: "test"`。
- 新增 `tools/arch-viewer/lib/analysis/resources.ts`：实现 `buildResourceView`，按 resource lifecycle anchor 顺序标注 `level`、`owner`、`scope`、`state`。
- 新增 `tools/arch-viewer/test/semantic-views.test.ts`：使用 fake gateway 的真实 DTO shape 覆盖 startup/data-flow/calls/resources 语义视图，特别锁定不生成 `Application::start -> createBootFlow::launch` 假边。

## TDD / 验证

- RED: `bun test tools/arch-viewer/test/semantic-views.test.ts`，结果 FAIL，原因是生产模块尚不存在：`Cannot find module '../lib/analysis/calls'`。
- GREEN: `bun test tools/arch-viewer/test/semantic-views.test.ts`，结果 PASS，5 tests / 23 expects。
- `bun test tools/arch-viewer/test`，结果 PASS，49 tests / 164 expects。
- `bun x tsc --noEmit -p tools/arch-viewer/tsconfig.json`，结果 PASS。
- `git diff --check`，结果 PASS。
- 自查：`as any|@ts-ignore` 无命中；新增文件行数均小于 300 行。

## 自审

- 解析器不解析 CodeGraph 文本输出，只通过 `CodeGraphGateway` 的 typed API 消费 JSON 结果。
- 路径解析只针对配置中相邻 anchor 做直接与两跳关系查询，没有全图遍历。
- 所有视图边保留 `evidence` 字段，declared fallback 的 evidence 为空数组并带 `declared: true` metadata。
- 输出节点、边、diagnostics 均做确定性排序。
- fake gateway 使用 `CodeGraphNode` 与 `CodeGraphRelationNode` 真实字段形状，避免测试依赖不存在的关系 DTO 字段。

## Concerns

- `CodeGraphRelationNode` 目前不携带完整 `qualifiedName` 或 symbol id，call view 对 relation-only 节点使用稳定派生 id，`qualifiedName` 只能保留 relation `name`。
- 两跳 evidence 只能证明存在相同中间 relation DTO，不展开中间节点为独立图节点；符合当前 brief 的受限路径要求，但未来如果 UI 要展示中间跳点，需要扩展图模型或 gateway DTO。

## Review Fix 1

### 状态

DONE

### 改动

- 修复 `resolveConfiguredPath` 在中间 anchor 缺失或歧义时压缩路径的问题。解析结果现在按原始 anchor 顺序保留空位，逐段只处理原始相邻 pair；任一端解析失败时不生成边。
- 新增最小回归测试覆盖 `A -> Missing -> C` 场景，即使 fake gateway 对 `A -> C` 有直接证据，也不得生成未声明的 `A -> C` 边。

### 验证

- `bun test tools/arch-viewer/test/semantic-views.test.ts`，结果 PASS，6 tests / 26 expects。
- `bun x tsc --noEmit -p tools/arch-viewer/tsconfig.json`，结果 PASS。
- `git diff --check`，结果 PASS。

### 自审

- 未修改无关文件，未引入新依赖。
- 未使用 `as any` 或 `@ts-ignore`。
- 失败 anchor 的 error diagnostic 保持输出，但对应相邻 pair 不再生成 declared 或 evidence 边。
