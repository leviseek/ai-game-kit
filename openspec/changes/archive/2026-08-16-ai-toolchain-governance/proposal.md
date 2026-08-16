# 2026-08-16-ai-toolchain-governance

## Why

工具链治理批次：AI 协作工具面在快速膨胀后出现结构性欠账——skills/commands 在 `.codex/.cursor/.opencode/.claude/.qoder` 五处复制且无单一来源（`.claude/skills/magic-ui` 与 `.qoder/skills/magic-ui` 为未跟踪空目录）；三个 subagent 全部硬绑 `codexapis/gpt-5.6-sol` 无降级路径；`tools/creator` 十二个命令零单元测试；fgui-designer 的 UI spec 是自由文本、字号档位/组件类型决策无法被机器校验；「源 XML → 真实发布 → 运行时验证」闭环仍依赖人工在 FGUI 编辑器操作；`bun run arch` 依赖人工 `codegraph init`；NOTE.md/README 与当前工具链现实漂移。**CI 门禁（pure-ts-gate）明确不在本 change 范围**——当前开发环境不完整，恢复 CI 另立 change。

## What Changes

- 新增 Bun workspace `tools/ai-sync`：以单一来源 registry 托管 skills/commands/agents/模型注册表，提供 `sync`（复制到各工具目录）、`check`（逐字 freshness 校验，仿 `checkTypeFreshness` 模式）、`doctor`（报告缺失/空目录/陈旧条目）、`verify-models`（读取模型注册表并探测可用性）四个命令，并接入 `bun run ai-sync`。
- 清理 `.claude/skills/magic-ui`、`.qoder/skills/magic-ui` 空目录（删除或补齐 SKILL.md）；`.ai/skills` 与 `.agents/skills` 归口到 registry 管理。
- subagent 模型路由化：模型注册表定义 角色 → primary/fallback；`.opencode/agent/*.md` 的 model 声明改为引用注册表；`verify-models` 输出不可用模型报告；AGENTS.md 增补「primary 不可用时用 fallback 覆写」的委派流程。
- UI spec 结构化：定义 JSON UI spec schema（zod），`tools/fgui` 新增 `spec-check` 命令，机器校验字号档位、组件类型决策、graph/transition 禁令、id 命名、relation sidePair ≤2；`/fgui-create`、`/fgui-edit` 命令流程改为先产出 spec.json 再映射 XML。
- `tools/creator` 补单元测试：args/env/proc/cdp/lock/log 纯函数层，`bun test ./tools/creator/test` 接入根测试门禁。
- 发布验证闭环：新增 `bun run verify:ui-loop` 编排命令（fgui validate --strict → fgui-mcp 真实发布 `redirectToScratch:false` → `check_publish` 三重证据 → `ccc ui-smoke` 运行时验证）；**依赖 FGUI 编辑器打开 + Creator 本地环境**，环境缺失时输出明确的跳过指引（不报错退出）。
- `tools/arch-viewer`：codegraph 索引自动初始化（ensure）——`.codegraph/codegraph.db` 缺失/过期时自动 `codegraph init`，CLI 缺失时给出带安装指引的类型化错误（替代 ADR-038 的纯指引）。
- 文档对齐：NOTE.md 标记为历史方法论记录并指向 README；README 修正目录地图（`ui/generated` → `assets/ui/generated`）并补 `ai-sync`/`verify:ui-loop` 门禁表；AGENTS.md 增补 ai-sync 与 UI spec 流程。

## Capabilities

### New Capabilities

- `ai-toolchain-registry`: skills/commands/agents 与模型注册表的单一来源同步、逐字 freshness 校验与漂移诊断。
- `ui-spec-validation`: 结构化 JSON UI spec 的定义、schema 校验与 `fgui spec-check` 机器检查。
- `ui-publish-verify-loop`: 「源 XML → validate → 真实发布 → 产物检测 → 运行时冒烟」的编排验证闭环。

### Modified Capabilities

- `architecture-visualization`: codegraph 索引由「人工显式 init」改为「自动 ensure（缺失/过期自动初始化，CLI 缺失类型化报错）」。

## Impact

- 新增 workspace：`tools/ai-sync`（devDependency 仅 `@types/node`，符合 `.ai/instructions.md` 第 3 条）。
- `tools/fgui`：新增 `commands/spec-check.ts` + `lib/spec.ts`（schema 与校验器），不影响既有 validate 语义。
- `tools/creator`：新增 `test/` 目录与 `tsconfig` 测试包含；根 `package.json` 的 `test` 链接入。
- `tools/arch-viewer`：`lib/codegraph/gateway.ts` 与 `cli.ts` 改动（ensure 逻辑）。
- 配置目录：`.opencode/.codex/.cursor/.claude/.qoder` 结构由 ai-sync 接管（agent/skills/commands 全部由 registry 生成）。
- 文档：`AGENTS.md`、`README.md`、`NOTE.md`、`doc/architecture/fgui-mvvm-binding-governance.md`。
- 无第三方运行时依赖新增；无游戏运行时（assets/framework、assets/game*）代码行为变化。
