# AI 工具链治理收官总结

> 对应 change：`openspec/changes/archive/2026-08-16-ai-toolchain-governance/`（**tasks 40/40 全部完成**）
> 架构决策：`doc/decisions/ADR-039-ai-toolchain-governance.md`
> 架构可视化：`doc/architecture/ai-toolchain-architecture.html`

## 一、背景与目标

工具链治理批次：AI 协作资产在五个工具目录（`.codex/.cursor/.claude/.opencode/.qoder`）复制无单一来源、subagent 模型硬编码无降级路径、UI spec 自由文本不可机器校验、发布验证依赖人工、creator 零单测、codegraph 索引依赖人工初始化。**明确排除 pure-ts-gate CI 门禁**（另立 change）。

## 二、能力全景（六项全部落地）

| 能力 | 落地产物 | 说明 |
|---|---|---|
| **AI 资产单一来源 registry** | `tools/ai-sync/`（workspace）+ `registry/` + `manifest.json` | skills/commands/agents 由 `bun run ai-sync sync --apply` 生成到五处工具目录；`check` 逐字 freshness（缺失/过期/多余均 error）；`doctor` 漂移诊断；结构错误短路语义。17 个资产经 `git mv` 迁入 registry |
| **模型注册表与降级探测** | `registry/models.json` + `lib/models.ts` + `lib/probe.ts` + `verify-models` | agent frontmatter 的 `model:` 由 `{{model:<role>}}` 占位符渲染（registry 存模板、target 存实际模型名）；`verify-models` 分层探测（opencode models list → 环境变量配置检查 → 未配置），诚实标注通道状态 |
| **UI spec 机器校验** | `tools/fgui/lib/spec.ts` + `commands/spec-check.ts` | `bun run fgui spec-check --spec <spec.json>`：字号档位（提示最近档位）、interactive 组件类型决策必填、graph/transition 禁令、relation sidePair ≤ 2、语义化命名（硬 error/软 warning）；`/fgui-create`、`/fgui-edit` 流程改为「spec.json → spec-check → XML」 |
| **creator 纯函数层单测** | `tools/creator/test/`（29 用例） | args/env/proc/lock/log/cdp 全覆盖；`buildKillChromeCommand`/`waitForPageTarget`/`findFreePort` 最小重构暴露纯函数；不启动 Creator 进程 |
| **codegraph 索引自动 ensure** | `tools/arch-viewer/lib/codegraph/gateway.ts` 的 `ensureCodeGraphIndex` | `bun run arch` 启动自动初始化（缺失/`status` 报 `reindexRecommended` 过期时 `codegraph init`）；`--refresh` 强制重建；CLI 缺失时索引存在容错、索引缺失透传安装指引 |
| **发布验证闭环** | `scripts/verify-ui-loop.ts` + `bun run verify:ui-loop --package <包>` | 四阶段：`fgui validate --strict` → MailboxBridge 真实发布（`redirectToScratch:false`）→ `checkPublish` 三重证据 → `ccc ui-smoke`；退出码 0/1/2（2=环境缺失，输出恢复指引）；**本机真实链路验证通过** |

## 三、落地批次与提交链

| Commit | 批次 | 内容 |
|---|---|---|
| `090814d` | 归档 | OpenSpec 归档 + ADR-039 + 4 个 main specs 同步 |
| `27e7cc1` | 架构图 | archify showcase 工具链架构可视化（首版） |
| `ef765c9` | 1.x–2.x | ai-sync registry + sync/check/doctor + 测试 |
| `145f2bb` | 3.x | 模型注册表 + agent 模板化 + verify-models |
| `46a6338` | 4.x | fgui spec-check + 命令流程更新 + governance doc |
| `9e26700` | 5.x | creator 纯函数层单测 |
| `deeee14` | 7.x–9.x | codegraph ensure + 文档对齐 + 收尾 |
| `bdd4e24` | 6.x | verify:ui-loop + 真实链路验证 |

## 四、验证证据

- 全门禁绿：`typecheck` 全链 / `lint` / `test` 全量（foundation + fgui 123 + fgui-mcp + arch 129 + ai-sync 43 + creator 29 + verify-ui-loop 10）
- `ai-sync check`：50 个受管文件与 registry 逐字一致；`doctor` 0 error/0 warning
- `openspec validate --specs --strict`：42/42
- **真实链路**：`bun run verify:ui-loop --package Demo` 四阶段全绿（validate ✓ → 真实发布 isSuccess=true → 三重证据 ✓ → ccc ui-smoke ✓，exit 0；发布产物与源一致无 git diff）

## 五、实现偏差记录（已写入 tasks.md）

1. **4.1 zod → 手写校验器**：`.ai/instructions.md` 第 3 条禁止第三方运行时依赖（允许清单仅 typescript/eslint/typescript-eslint/@types/node），spec-check 改手写类型化校验器，规则语义与 design D5 一致。
2. **8.2 verify:ui-loop 延迟登记**：6.x 未实现时 README 不登记不存在的命令；6.x 落地后（`bdd4e24`）已补登记。
3. **Open Question（未落地）**：per-tool 命令引用变体（`.codex` 的 `$openspec-*` vs `.opencode` 的 `/opsx-*`）统一为 `/opsx-*` 风格——如未来需要 per-tool frontmatter/引用变体，registry 需支持 per-target 模板。

## 六、后续建议

- **恢复 CI**（另立 change）：`.github/workflows/pure-ts-gate.yml.disabled` 启用（typecheck:ci + lint + test + `fgui validate --strict` × 4 包 + openspec specs），需 GitHub Actions 仓库配置；`verify:ui-loop` 的发布/冒烟阶段属 Creator 授权层，走自托管 runner。
- **验证回归**：本机环境已就绪，可周期性跑 `bun run verify:ui-loop --package AutoBattle/CardGame/Common` 覆盖多包闭环。
