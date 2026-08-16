# Tasks: 2026-08-16-ai-toolchain-governance

## 1. tools/ai-sync 骨架与资产迁移

- [ ] 1.1 创建 `tools/ai-sync` workspace（package.json/tsconfig.json，devDependency 仅 `@types/node`），根 package.json `workspaces` 登记并新增 `ai-sync` script（`bun ./tools/ai-sync/cli.ts`）
- [ ] 1.2 创建 registry 目录结构（`registry/skills|commands|agents/`），用 `git mv` 把现有资产迁入单一真源：openspec-* 六个 skill（去重 `.codex/.cursor/.opencode/.qoder` 四处副本）、find-skills（`.claude/.qoder/.agents`）、fgui-designer/fgui-ui-alchemist/visual-verifier（`.opencode/agent`）、fgui-create/fgui-edit（`.opencode/commands`）、opsx-* 系列命令
- [ ] 1.3 删除 `.claude/skills/magic-ui` 与 `.qoder/skills/magic-ui` 未跟踪空目录（无 SKILL.md 内容可保留，删除并在交付说明记录）
- [ ] 1.4 编写 `manifest.json`：每个资产 id → 目标工具目录 + 目标文件名映射（含 `.qoder/commands/opsx/<cmd>.md` 与 `.cursor/commands/opsx-<cmd>.md` 的形态差异、`.ai/skills` 显式声明为空）
- [ ] 1.5 `tools/ai-sync` 接入 `typecheck`/`lint` 门禁（tsconfig include + eslint 覆盖）

## 2. sync / check / doctor 实现

- [ ] 2.1 `lib/manifest.ts`：manifest 加载与结构校验（重复资产 id、目标目录不存在、源文件缺失 → 结构化错误）
- [ ] 2.2 `lib/sync.ts`：按 manifest 重算每个受管文件期望内容；`check` 与磁盘逐字对比（缺失/过期/多余均 error，语义对齐 `checkTypeFreshness`）
- [ ] 2.3 `commands/check.ts` 与 `commands/sync.ts`：CLI 接线——`check` 非零退出并列出全部差异；`sync` 默认 dry-run 输出差异清单，`--apply` 才落盘
- [ ] 2.4 `commands/doctor.ts`：union 报告（缺失/过期/多余/未受管空目录/registry 结构错误），每项带严重度与修复建议
- [ ] 2.5 `test/`：manifest 解析、逐字对比、doctor 汇总、空目录扫描单测；根 `test` 链接入 `bun test ./tools/ai-sync/test`
- [ ] 2.6 迁移后首次 `bun run ai-sync sync --apply` + `check` 转绿；typecheck/lint 通过

## 3. 模型注册表与 verify-models

- [ ] 3.1 `registry/models.json`：角色 → primary/fallback（fgui-designer/fgui-ui-alchemist/visual-verifier 三角色，primary 沿用 `codexapis/gpt-5.6-sol`，fallback 由执行期定）
- [ ] 3.2 agent 模板化：`registry/agents/*.md` frontmatter 的 `model:` 由 models.json 注入（占位符 + 生成逻辑），agent 正文禁止裸模型名散落
- [ ] 3.3 `commands/verify-models.ts`：分层探测——优先模型列表通道，通道不可用降级为环境变量存在性检查，输出标注探测通道状态（真实探测/配置检查/未配置）
- [ ] 3.4 `test/`：models.json 解析、verify-models 输出格式、agent 模板渲染一致性单测

## 4. UI spec 结构化（tools/fgui spec-check）

- [ ] 4.1 `tools/fgui/lib/spec.ts`：zod schema（画布/目标包/从底到顶布局树/`interactive` 组件类型决策/字号/颜色/资源引用/待确认项）+ 校验器（硬规则 error、软规则 warning 分级）
- [ ] 4.2 `commands/spec-check.ts`：`bun run fgui spec-check --spec <spec.json>` CLI 接线，非档位字号提示最近档位
- [ ] 4.3 `tools/fgui/test/spec.test.ts`：字号档位、类型决策缺失、graph/transition 禁令、relation sidePair>2、命名前缀各分支
- [ ] 4.4 经 registry 更新 `.opencode/commands/fgui-create.md` 与 `fgui-edit.md`：增加「先产出 spec.json → `spec-check` 通过 → 再映射 XML」阶段（同步后 check 转绿）
- [ ] 4.5 `doc/architecture/fgui-mvvm-binding-governance.md` 自动绑定链流程补 spec.json 前置步骤

## 5. tools/creator 单元测试（纯函数层）

- [ ] 5.1 `test/args.test.ts`：parseArgs 各分支（flag/require/help）
- [ ] 5.2 `test/env.test.ts`：`COCOS_CREATOR_HOME` 解析与回退（fixtures 驱动）
- [ ] 5.3 `test/proc.test.ts`：`killChromeByProfile` 过滤逻辑（只清自己启动的实例）
- [ ] 5.4 `test/lock.test.ts`、`test/log.test.ts`：锁获取/释放、sleep 边界与日志格式
- [ ] 5.5 `test/cdp.test.ts`：`findFreePort` 真实端口分配、`waitForPageTarget` 用假 server 验证超时与命中
- [ ] 5.6 `tools/creator/tsconfig.json` 纳入 test 目录；根 `test` 链接入 `bun test ./tools/creator/test`（无 Creator 环境可跑）

## 6. 发布验证闭环 verify:ui-loop

- [ ] 6.1 `scripts/verify-ui-loop.ts`：四阶段编排（子进程 `fgui validate --strict` → 复用 `tools/fgui-mcp/lib/bridge.ts` MailboxBridge 发真实发布 `redirectToScratch:false` → 复用 `lib/check-publish.ts` 三重证据 → 子进程 `ccc ui-smoke`）；`--package` 必填否则拒绝；退出码约定 0 通过 / 1 阶段失败 / 2 环境缺失
- [ ] 6.2 环境检测：编辑器探针可达性（mailbox 目录/探针响应）、`COCOS_CREATOR_HOME`；缺失时输出恢复指引并以退出码 2 结束，绝不假装成功
- [ ] 6.3 根 package.json scripts 增 `verify:ui-loop`；README 门禁命令表登记
- [ ] 6.4 环境缺失路径单测（mock bridge/子进程）；真实发布链路需 FGUI 编辑器 + Creator 本地验证，结果记入交付说明

## 7. codegraph 索引自动 ensure

- [ ] 7.1 `tools/arch-viewer/lib/codegraph/gateway.ts` 新增 `ensureIndex()`：`.codegraph/codegraph.db` 缺失自动 `codegraph init`；存在直接使用；`--refresh` 强制重建；codegraph ENOENT 沿用类型化指引错误
- [ ] 7.2 `cli.ts` 启动分析器前调用 `ensureIndex()`，init 输出进度
- [ ] 7.3 `tools/arch-viewer/test/` 增加 ensure 分支（mock gateway：缺失/存在/ENOENT 三态）
- [ ] 7.4 README 快速开始移除「人工 codegraph init」步骤

## 8. 文档对齐

- [ ] 8.1 `NOTE.md` 顶部加「历史方法论记录」横幅，指向 README 与 `doc/`，正文保留
- [ ] 8.2 `README.md` 目录地图修正 `ui/generated` → `assets/ui/generated`；门禁命令表增补 `bun run ai-sync`、`bun run verify:ui-loop`
- [ ] 8.3 `AGENTS.md` 新增「AI 资产治理」章节：受管文件（skills/commands/agents）禁止手改工具目录、改 registry 后必须 `sync` 且提交前 `check` 通过；模型降级委派流程（primary 不可用时用 fallback 覆写）；UI spec 流程引用 spec-check

## 9. 门禁与收尾

- [ ] 9.1 全部门禁本地跑绿：`bun run typecheck`、`bun run lint`、`bun run test`、`bun run fgui validate --strict`（Demo/Common/CardGame/AutoBattle）
- [ ] 9.2 `openspec validate --change 2026-08-16-ai-toolchain-governance` 通过；归档前复核 proposal/specs/design/tasks 一致性
- [ ] 9.3 ADR 检查任务：change 完成前检查本次工作是否产生新的架构决策（候选：AI 资产单一来源 registry 治理模式、UI spec 机器校验、发布验证闭环编排）；如有按 `doc/decisions/ADR-NNN-<slug>.md` 约定创建 ADR；如无，明确记录无需 ADR
