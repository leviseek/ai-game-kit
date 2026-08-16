# ADR-039: AI Toolchain Governance — Asset Registry, UI Spec Validation, and Publish Verify Loop

## Status

Accepted

## Context

工具链治理批次（落地 change：`2026-08-16-ai-toolchain-governance`）。AI 协作资产膨胀后的结构性欠账：

1. skills/commands/agents 在 `.codex/.cursor/.claude/.opencode/.qoder` 五处复制且无单一来源；`.claude/skills/magic-ui` 与 `.qoder/skills/magic-ui` 为未跟踪空目录；`.ai/skills` 与 `.agents/skills` 归口不明。
2. 三个 subagent 全部硬编码 `codexapis/gpt-5.6-sol`，无降级路径。
3. fgui-designer 的 UI spec 是自由文本，字号档位/组件类型决策无法被机器校验。
4. 「源 XML → 真实发布 → 运行时验证」闭环依赖人工在 FGUI 编辑器操作。
5. `tools/creator` 十二个命令零单元测试；`bun run arch` 依赖人工 `codegraph init`。
6. **CI 门禁（pure-ts-gate）明确排除**：当前开发环境不完整，恢复 CI 另立 change。

## Decision

### 1. AI 资产单一来源 registry（`tools/ai-sync`）

新建独立 Bun workspace `tools/ai-sync`：`registry/`（skills/commands/agents/models.json 真源）+ `manifest.json`（资产 id → 目标工具目录映射）。提供四命令：

- `sync`：按 manifest 生成受管文件到五处工具目录（默认 dry-run，`--apply` 落盘）；
- `check`：逐字 freshness 校验（缺失/过期/多余均 error，语义对齐 `checkTypeFreshness`）；
- `doctor`：union 诊断（缺失/过期/多余/空目录/registry 结构错误）；
- `verify-models`：模型注册表探测（真实通道优先，降级配置检查）。

**工具目录不再是真源**：受管文件全部由 registry 生成，禁止手改；改 registry 后必须 `sync` 且提交前 `check` 通过。选独立 workspace 而非扩展现有 `tools/fgui`——FGUI 领域与 AI 资产治理是两个域，且 registry 未来承接非 FGUI 资产。

### 2. UI spec 结构化 + 机器校验（`fgui spec-check`）

UI spec 从自由文本升级为 JSON（zod schema，落 `tools/fgui/lib/spec.ts`），新增 `bun run fgui spec-check --spec <spec.json>`：硬规则（error）——字号 ∈ 档位表、交互对象必填组件类型决策、graph/transition 禁令、relation sidePair ≤2、命名前缀；软规则（warning）——坐标推导提示。`/fgui-create`、`/fgui-edit` 流程改为「先产出 spec.json → spec-check 通过 → 再映射 XML」。两条输入通道（读图/文字）收敛到同一机器可校验中间产物。

### 3. 发布验证闭环编排（`verify:ui-loop`）

新增 `scripts/verify-ui-loop.ts`（顶层编排，跨 fgui/fgui-mcp/ccc 三域，不放新 workspace）：四阶段——`fgui validate --strict` → 复用 `MailboxBridge` 真实发布（`redirectToScratch:false`）→ 复用 `check-publish.ts` 三重证据 → `ccc ui-smoke`。退出码约定 `0` 通过 / `1` 阶段失败 / `2` 环境缺失（编辑器探针不可达或 Creator 缺失，输出恢复指引，绝不假装成功）；`--package` 必填（发布安全确认）。

### 4. codegraph 索引自动 ensure

`tools/arch-viewer/lib/codegraph/gateway.ts` 新增 `ensureIndex()`：`.codegraph/codegraph.db` 缺失/过期自动 `codegraph init`，`--refresh` 强制重建；codegraph 可执行文件 ENOENT 沿用类型化指引错误（ADR-038 决策 4 行为不变）。

### 5. tools/creator 纯函数层单测

`tools/creator/test/` 覆盖 `lib/args|env|proc|lock|log|cdp` 纯函数（可注入依赖，不启动 Creator 进程），根 `test` 链接入 `bun test ./tools/creator/test`。

## Consequences

- **tools/ai-sync**：新增 workspace；五处工具目录变为生成物；`check` 进提交门禁；`magic-ui` 空目录删除（无 SKILL.md 内容可保留）。
- **tools/fgui**：新增 `spec-check` 与 `lib/spec.ts`；validate 语义不变。
- **编排**：`scripts/verify-ui-loop.ts` + `verify:ui-loop` script；环境缺失语义化退出码 2。
- **arch-viewer**：codegraph 自动初始化；README 快速开始移除人工 init 步骤。
- **文档**：AGENTS.md 新增「AI 资产治理」章节；README 门禁命令表增补；NOTE.md 标记为历史方法论记录。
- **Non-Goals（记录）**：pure-ts-gate CI 恢复（另立 change）；FGUI 编辑器插件能力不新增（真实发布已存在，仅做编排）；不引入新运行时依赖；不改游戏运行时代码。
