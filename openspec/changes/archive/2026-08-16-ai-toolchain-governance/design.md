# Design: 2026-08-16-ai-toolchain-governance

## Context

现状约束（详见 proposal.md - Why）：AI 协作资产分散在 `.codex/.cursor/.claude/.opencode/.qoder` 五处且无单一来源；`.claude/skills/magic-ui` 与 `.qoder/skills/magic-ui` 是未跟踪空目录；三个 subagent 模型硬编码 `codexapis/gpt-5.6-sol`；`tools/creator` 无单测；UI spec 是自由文本；发布验证依赖人工；`bun run arch` 需人工 `codegraph init`。

仓库既有模式可复用：`tools/fgui` 的 freshness 逐字校验（`checkTypeFreshness`/`checkConstantFreshness`）、Bun workspace 划分、`bun run <tool>` 脚本接线、`bun:test` 测试（fgui/fgui-mcp/arch-viewer 已 8/16/21 个测试文件）、`fgui-mcp` 的 `MailboxBridge` 与 `check-publish` 三重证据。设计目标是把这些成熟模式平移到治理层，不发明新范式。

## Goals / Non-Goals

**Goals:**
- 单一来源 + 确定性同步：skills/commands/agents/模型注册表全部由 `tools/ai-sync` registry 生成，漂移可被机器检出。
- subagent 模型声明可治理：模型标识来自注册表，可用性可探测。
- UI spec 机器可校验：字号档位/类型决策/禁令在 XML 前被拦截。
- `tools/creator` 纯函数层获得单测覆盖。
- 发布验证闭环收敛为一条命令，环境缺失语义化降级。
- codegraph 索引自动 ensure，README/AGENTS/NOTE 文档对齐现实。

**Non-Goals:**
- **不恢复 pure-ts-gate / 任何 CI 门禁**（用户明确排除，当前环境不完整）。
- 不新增 FGUI 编辑器插件能力（真实发布 `redirectToScratch:false` 已存在，本 change 只做编排）。
- 不引入新的模型供应商或运行时依赖（`tools/ai-sync` 仅 `@types/node`）。
- 不改动游戏运行时（`assets/framework`、`assets/game*`）代码与行为。
- 不为 UI spec 新增「像素级坐标自动推导」等 AI 能力，spec-check 只做确定性校验。

## Decisions

### D1: 新增独立 workspace `tools/ai-sync`

新建 `tools/ai-sync`（Bun workspace，与 `tools/fgui` 同构），提供 `bun run ai-sync sync|check|doctor|verify-models`。

- **备选**：扩展现有 `tools/fgui`。否决——FGUI 领域与 AI 资产治理是两个域，混入会污染 fgui 的语义；且 registry 未来可能承接非 FGUI 资产。
- **备选**：纯 shell 脚本。否决——需要 freshness 逐字校验与结构诊断，脚本难以测试与类型检查。
- 结构：`registry/`（真源）+ `manifest.json`（目标映射）+ `lib/`（纯函数，可单测）+ `commands/`（四个子命令）。

### D2: registry 布局与目标映射（manifest 驱动）

`registry/` 目录即唯一真源，按资产类型组织：

```text
tools/ai-sync/
  registry/
    skills/<skill-id>/SKILL.md        # openspec-propose、find-skills、magic-ui 等
    commands/<command-id>/<file>.md   # opsx-propose、fgui-create、fgui-edit 等
    agents/<agent-id>/<file>.md       # fgui-designer、fgui-ui-alchemist、visual-verifier
    models.json                        # 角色 → primary/fallback
  manifest.json                        # 每个资产 id → 目标工具目录 + 目标文件名
```

`manifest.json` 声明映射，例如：`openspec-*` skills → `.codex/.cursor/.opencode/.qoder/skills/`；`find-skills` → `.claude/.qoder/.agents/skills/`；`magic-ui` → `.claude/.qoder/skills/`；`fgui-designer` 等三个 agent → `.opencode/agent/`；`fgui-create`/`fgui-edit` → `.opencode/commands/`；`opsx-*` → 四个工具的 commands（文件名按各工具约定，如 `.qoder/commands/opsx/` 子目录形态，manifest 里逐条声明）。**工具目录不是真源**，受管文件由 `sync` 生成。

- 现有内容迁移用 `git mv` 进 `registry/`（保留历史），`magic-ui` 空目录**删除**（无 SKILL.md 内容可保留，纳入任务记录）；`.ai/skills` 缺口由 manifest 显式声明（当前无资产，doctor 不报缺失）。

### D3: sync/check/doctor 语义对齐 fgui freshness

- `check`：重算每个受管文件在目标目录的期望内容，与磁盘**逐字对比**，缺失/过期/多余均 error、非零退出——与 `checkTypeFreshness` 同构。
- `sync`：先跑 check 逻辑，dry-run 输出差异清单；`--apply` 才落盘写入；空目录残留列出但不自动删除（人工决定）。
- `doctor`：union 全部问题（缺失/过期/多余/空目录/registry 结构错误如重复 id、manifest 指向不存在文件），带严重度与修复建议。
- 测试：`tools/ai-sync/test/`（manifest 解析、逐字对比、doctor 汇总、空目录扫描），接入 `bun run test` 链。

### D4: 模型注册表与 agent 模板

`registry/models.json`：`{ "fgui-designer": { "primary": "codexapis/gpt-5.6-sol", "fallback": null }, ... }`。agent 文件改为由 registry 模板生成：frontmatter 的 `model:` 从 models.json 注入，禁止在 agent 正文散落裸模型名。

`verify-models` 探测策略分层：优先调用可用的模型列表通道（如 opencode 的 models 枚举）；通道不可用时降级为「读取注册表 + 环境变量（如 `CODEX_API_KEY`/provider 配置）存在性检查」，输出「未配置探测通道」warning 而非假装探测成功。

- **备选**：直接在 opencode.json 做模型 fallback 配置。否决——opencode 无原生 fallback 语义，且 agent 文件分布在多工具，注册表方案跨工具一致。

### D5: UI spec 结构化（JSON + zod schema，落在 tools/fgui）

- 新增 `tools/fgui/lib/spec.ts`（zod schema + 校验器）与 `commands/spec-check.ts`，命令 `bun run fgui spec-check --spec <spec.json>`。
- schema 覆盖 fgui-designer 现有文本 spec 的全部要素：画布/包、布局树（name/type/xy/size/fontSize/color/src/interactive/relation）、组件类型决策（`interactive: true` 时必须给 `componentType` + `rationale`）、待确认项。
- 校验规则（硬规则报 error，软规则报 warning）：
  - 硬：字号 ∈ 档位表（提示最近档位）；`interactive` 对象缺类型决策；type=graph；transition 字段存在；relation sidePair >2；对象名违反语义前缀。
  - 软：坐标可推导性提示（不强制，AI 仍需 judgment）。
- `/fgui-create`、`/fgui-edit` 命令流程改为「先产出 spec.json → `spec-check` 通过 → 再映射 XML」，命令文件本身纳入 ai-sync registry。
- 测试：`tools/fgui/test/spec.test.ts`（档位/决策/禁令/relation 各分支）。

### D6: 发布验证闭环 `verify:ui-loop`

- 新增 `scripts/verify-ui-loop.ts`（顶层编排，与 `build-fairygui.ts` 同级），`bun run verify:ui-loop --package <包名>`。
- 四阶段：① 子进程 `bun run fgui validate --strict --package <包>`；② 直接复用 `tools/fgui-mcp/lib/bridge.ts` 的 `MailboxBridge` 发 `fgui_trigger_publish { redirectToScratch: false }`（不经 stdio MCP，进程内复用文件邮箱通道）；③ 复用 `tools/fgui-mcp/lib/check-publish.ts` 三重证据检测；④ 子进程 `bun run ccc ui-smoke`。
- 退出码约定：`0` 全通过；`1` 任一阶段失败；`2` 环境缺失（编辑器探针不可达 / Creator 缺失），此时输出跳过指引（`COCOS_CREATOR_HOME`、编辑器需打开并加载 fgui-mcp-probe）。
- 安全：`--package` 必填，未声明直接拒绝（对应 spec 的「发布安全确认」）。
- 不新增 workspace：编排跨 fgui/fgui-mcp/ccc 三域，放 `scripts/` 避免第四层 workspace。

### D7: tools/creator 单测（纯函数层）

- 新增 `tools/creator/test/`，覆盖 `lib/args.ts`（parseArgs 各分支）、`lib/env.ts`（`COCOS_CREATOR_HOME` 解析与回退）、`lib/proc.ts`（`killChromeByProfile` 的过滤逻辑）、`lib/lock.ts`、`lib/log.ts`（sleep/日志）、`lib/cdp.ts`（`findFreePort`、`waitForPageTarget` 用假 server 验证）。
- 全部为纯函数/可注入依赖，不启动 Creator 进程；`bun:test` 无新增依赖；`package.json` 的 `test` 链追加 `bun test ./tools/creator/test`，`tools/creator/tsconfig.json` 纳入 test 目录。

### D8: codegraph 索引自动 ensure

- `tools/arch-viewer/lib/codegraph/gateway.ts` 新增 `ensureIndex()`：`.codegraph/codegraph.db` 缺失 → 自动 `codegraph init`；存在 → 直接使用；`--refresh` 强制重建。codegraph 可执行文件 ENOENT → 沿用现有类型化指引错误（spec 要求行为不变）。
- `cli.ts` 在启动分析器前调用 `ensureIndex()`，init 耗时输出进度；自动 init 失败给出明确错误而非静默。
- 测试：`tools/arch-viewer/test/` 增加 ensure 分支（mock gateway）。

### D9: 文档对齐

- `NOTE.md`：顶部加「历史方法论记录」横幅，指向 README 与 `doc/`，正文保留不改。
- `README.md`：目录地图修正 `ui/generated` → `assets/ui/generated`；门禁命令表增补 `bun run ai-sync`、`bun run verify:ui-loop`；快速开始移除「人工 codegraph init」改为自动。
- `AGENTS.md`：新增「AI 资产治理」章节——受管文件（skills/commands/agents）禁止手改工具目录、改 registry 后必须 `bun run ai-sync sync` 且提交前 `check` 通过；UI spec 流程引用 spec-check。
- `doc/architecture/fgui-mvvm-binding-governance.md`：绑定链流程补 spec.json 前置步骤。

## Risks / Trade-offs

- [ai-sync 覆盖人工在工具目录的临时修改] → `sync` 默认 dry-run + 差异清单，`check` 先行；registry 在 git 中，误覆盖可 revert。
- [verify-models 无真实探测通道时退化为配置检查，可能误报可用] → 输出明确标注探测通道状态（真实探测/配置检查/未配置），不把降级结果当权威。
- [verify:ui-loop 强依赖本地 FGUI 编辑器 + Creator] → 语义化退出码 2 + 恢复指引，绝不在环境缺失时假装成功；CI（本 change 不做）可跳过环境阶段。
- [spec schema 过严导致 fgui-designer 抗拒] → 硬/软规则分级，硬规则只锁「确定会坏」的项（档位/类型决策/禁令），观感类全部留给人工确认项。
- [codegraph 自动 init 耗时影响 `bun run arch` 首启] → 输出进度 + 仅缺失/过期时触发；`--refresh` 显式重建。
- [creator 单测与 Creator 环境混淆] → 测试严格限定纯函数层，无进程依赖，`bun run test` 在无 Creator 环境可跑。

## Migration Plan

1. 建 `tools/ai-sync` 骨架 + manifest，`git mv` 迁移既有 skills/commands/agents 进 registry，删除 magic-ui 空目录。
2. `sync --apply` 生成五处工具目录受管文件；`check` 转绿。
3. models.json + agent 模板化，verify-models 落地。
4. UI spec schema + spec-check + 命令流程更新（命令文件经 registry 改）。
5. creator 单测、verify:ui-loop、codegraph ensure、文档对齐。
6. 全部门禁本地跑绿（typecheck/lint/test/fgui validate --strict）；提交单 commit 便于 revert。
7. 回滚：整 change 单 commit revert；registry 与工具目录同步回滚由 `git revert` 保证（受管文件全部由 registry 生成，无二义）。

## Open Questions

- `verify-models` 的真实探测通道（优先调 opencode models 枚举还是直接请求 provider API）可在任务执行期按当时环境决定，不影响 spec/设计/任务拆分。
