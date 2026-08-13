# Task 3 Report

## Result

- 新增架构配置类型、冻结 builder 与纯结构校验。
- 复用 `lib/graph/types.ts` 的 `Diagnostic`，未创建同义图类型。
- 新增真实仓库配置，覆盖指定 assets 分层与四个 tools workspace。
- 启动配置以 `AppRoot::onLoad` 装配，并从 `AppRoot::start` 分为 Application 与 presentation 两个 branch。

## TDD

- RED 1：`config.test.ts` 因配置模块不存在失败。
- GREEN 1：实现类型、builder、校验与真实配置后，4 个测试通过。
- RED 2：缺失 exception `reason` 的测试按预期失败。
- GREEN 2：补齐校验后，5 个配置测试通过。

## Verification

- `bun test tools/arch-viewer/test/config.test.ts`：5 pass，0 fail。
- `bun test tools/arch-viewer/test`：11 pass，0 fail。
- `bun x tsc --noEmit -p tools/arch-viewer/tsconfig.json`：通过。
- `git diff --check`：通过。

## Review

- 新文件均少于 300 行。
- 未新增依赖，注释使用简体中文。
- 纯校验不处理依赖实际文件清单的 ownership overlap，该职责保留给 Analyzer。
- 未发现需要新增 ADR 的架构决策。

## Fix Round 1

- 审查发现 `defineArchitectureConfig` 仅浅复制容器，普通对象输入仍可通过原始引用修改结果。
- RED：新增普通可变 root/rule/phase/branch/symbol/flow/lifecycle 输入测试，修改原始 `root.id` 后结果同步变化，测试按预期失败。
- GREEN：按 `ArchitectureConfig` 已知结构递归复制并冻结 group、rule、startup、flow、lifecycle 及全部 symbol/数组；未引入通用 class 或循环结构深拷贝。
- 验证：配置测试 6 pass / 0 fail；完整 arch-viewer 测试、TypeScript 类型检查与 `git diff --check` 均通过。
