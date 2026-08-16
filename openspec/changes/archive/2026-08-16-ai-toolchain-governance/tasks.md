# Tasks: 2026-08-16-ai-toolchain-governance

## 1. tools/ai-sync 骨架与资产迁移

- [x] 1.1 创建 `tools/ai-sync` workspace（package.json/tsconfig.json，devDependency 仅 `@types/node`），根 package.json `workspaces` 登记并新增 `ai-sync` script（`bun ./tools/ai-sync/cli.ts`）
- [x] 1.2 创建 registry 目录结构（`registry/skills|commands|agents/`），用 `git mv` 把现有资产迁入单一真源：openspec-* 六个 skill（去重 `.codex/.cursor/.opencode/.qoder` 四处副本）、find-skills（`.claude/.qoder/.agents`）、fgui-designer/fgui-ui-alchemist/visual-verifier（`.opencode/agent`）、fgui-create/fgui-edit（`.opencode/commands`）、opsx-* 系列命令
- [x] 1.3 删除 `.claude/skills/magic-ui` 与 `.qoder/skills/magic-ui` 未跟踪空目录（无 SKILL.md 内容可保留，删除并在交付说明记录）
- [x] 1.4 编写 `manifest.json`：每个资产 id → 目标工具目录 + 目标文件名映射（含 `.qoder/commands/opsx/<cmd>.md` 与 `.cursor/commands/opsx-<cmd>.md` 的形态差异；`.ai/skills` 当前无资产，不声明即不受管，doctor 不报缺失）
- [x] 1.5 `tools/ai-sync` 接入 `typecheck`/`lint` 门禁（tsconfig include + eslint 覆盖）

## 2. sync / check / doctor 实现

- [x] 2.1 `lib/manifest.ts`：manifest 加载与结构校验（非法 id、重复 target、源文件缺失 → 结构化错误，`hasStructuralErrors` 短路语义）
- [x] 2.2 `lib/sync.ts`：按 manifest 重算每个受管文件期望内容；`check` 与磁盘逐字对比（缺失/过期均 error、多余/空目录 warning，语义对齐 `checkTypeFreshness`）
- [x] 2.3 `commands/check.ts` 与 `commands/sync.ts`：CLI 接线——`check` 非零退出并列出全部差异；`sync` 默认 dry-run 输出差异清单，`--apply` 才落盘
- [x] 2.4 `commands/doctor.ts`：union 报告（缺失/过期/多余/未受管空目录/registry 结构错误），每项带严重度与修复建议；结构错误短路
- [x] 2.5 `test/`：manifest 解析、逐字对比、doctor 汇总、空目录扫描单测（fixture 驱动，20 用例）；根 `test` 链接入 `bun test ./tools/ai-sync/test`
- [x] 2.6 迁移后首次 `bun run ai-sync sync --apply`（50 个受管文件落盘）+ `check` 转绿；typecheck/lint 通过

## 3. 模型注册表与 verify-models

- [x] 3.1 `registry/models.json`：角色 → primary/fallback（fgui-designer/fgui-ui-alchemist/visual-verifier 三角色，primary 沿用 `codexapis/gpt-5.6-sol`，fallback 当前为 null——执行期无多模型策略，未配置即不声明降级）
- [x] 3.2 agent 模板化：`registry/agents/*.md` frontmatter 的 `model:` 改为 `{{model:<role>}}` 占位符，`expectedFiles` 对 agent 资产经 models.json 渲染 primary（渲染错误经 `validateAgentTemplates` 进结构错误短路；target 保持实际模型名，registry 为模板）
- [x] 3.3 `commands/verify-models.ts`：分层探测——opencode models list 真实通道优先，CLI 不可达降级环境变量配置检查（CODEX_API_KEY/OPENAI_API_KEY），再不可用报未配置；输出标注探测通道状态（cli/env/none）
- [x] 3.4 `test/`：models.json 解析、模板渲染（占位符/未知角色/语法残留）、probe 分层（cli/env/none 三通道）、agent 模板渲染一致性单测（43 用例全量）；既有测试适配 expectedFiles 新签名

## 4. UI spec 结构化（tools/fgui spec-check）

- [x] 4.1 `tools/fgui/lib/spec.ts`：UI spec 类型 + 校验器（画布/目标包/从底到顶布局树/`interactive` 组件类型决策/字号档位/颜色/资源引用/待确认项），硬规则 error（graph 与 transition 禁令、interactive 决策必填、非档位字号、relation sidePair>2、无语义命名）、软规则 warning（缺 src/字号/尺寸）。**实现偏差：tasks 原计划 zod，因 `.ai/instructions.md` 第 3 条禁止第三方运行时依赖，改手写类型化校验器（规则语义与 design D5 一致）**
- [x] 4.2 `commands/spec-check.ts`：`bun run fgui spec-check --spec <spec.json>` CLI 接线，非档位字号提示最近档位（平局取小）
- [x] 4.3 `tools/fgui/test/spec.test.ts`：字号档位（含最近档位）、类型决策缺失、graph/transition 禁令、relation sidePair>2、命名前缀、软规则各分支（18 用例）
- [x] 4.4 经 registry 更新 `.opencode/commands/fgui-create.md` 与 `fgui-edit.md`：增加「先产出 spec.json → `spec-check` 通过 → 再映射 XML」阶段（fgui-edit 改为先产出目标状态 spec 再修改）；sync 后 check 转绿（50 个受管文件一致）
- [x] 4.5 `doc/architecture/fgui-mvvm-binding-governance.md` 自动绑定链流程补 spec.json 前置步骤（双通道收敛 → spec-check → XML）

## 5. tools/creator 单元测试（纯函数层）

- [x] 5.1 `test/args.test.ts`：parseArgs 各分支（key value/=value/布尔/help/位置参数）+ flagString/flagBool/flagNumber
- [x] 5.2 `test/env.test.ts`：`COCOS_CREATOR_HOME`/`CHROME_PATH` 经临时 fake exe fixtures 驱动（返回命中、不误报），getCreatorVersion/getCreatorTempDir 读真实工程
- [x] 5.3 `test/proc.test.ts`：`killChromeByProfile` 过滤逻辑——抽 `buildKillChromeCommand` 纯函数断言 user-data-dir 过滤与反斜杠转义、不含无差别 kill（不执行 PowerShell）
- [x] 5.4 `test/lock.test.ts`、`test/log.test.ts`：锁获取/活锁拒绝/释放重取/僵尸锁自动清除；sleep 边界、readTextWithRetry 正常/重试耗尽、waitForPattern 命中/超时
- [x] 5.5 `test/cdp.test.ts`：`findFreePort` 真实端口分配；`waitForPageTarget` 用假 CDP server（node http）验证命中/无 page 超时/端口未监听超时（导出该函数）
- [x] 5.6 `tools/creator/tsconfig.json` 显式 `exclude test`（与 ai-sync 一致：测试由 bun 运行时校验、不参与 tsc）；根 `test` 链接入 `bun test ./tools/creator/test`（无 Creator 环境可跑，29 用例）

## 6. 发布验证闭环 verify:ui-loop

- [x] 6.1 `scripts/verify-ui-loop.ts`：四阶段编排（子进程 `fgui validate --strict` → 复用 `tools/fgui-mcp/lib/bridge.ts` MailboxBridge 发真实发布 `redirectToScratch:false` → 复用 `lib/check-publish.ts` 三重证据 → 子进程 `ccc ui-smoke`）；`--package` 必填否则拒绝；退出码约定 0 通过 / 1 阶段失败 / 2 环境缺失。核心编排 `verifyUiLoop(pkg, deps)` 依赖可注入便于单测，入口 `import.meta.main` 守卫
- [x] 6.2 环境检测：编辑器探针可达性（`isBridgeReachable` + 发布桥接 `reached` 判定）、`findCreatorHome()` 预检 Creator；缺失时输出恢复指引（编辑器前台/插件日志、`COCOS_CREATOR_HOME`/`ccc open`）并以退出码 2 结束，绝不假装成功
- [x] 6.3 根 package.json scripts 增 `verify:ui-loop`（`test:verify-ui-loop` 接入 test 链）；README 门禁命令表登记（标注需 FGUI 编辑器 + Creator 环境，退出码 2 表示环境缺失）
- [x] 6.4 环境缺失路径单测（`scripts/test/verify-ui-loop.test.ts` 10 用例：工程不可定位/探针不可达/发布桥接不可达/Creator 不可定位/validate 阻断/发布失败/isSuccess=false/证据不一致/ui-smoke 失败/全通过）；**真实链路已本机验证通过**：`bun run verify:ui-loop --package Demo` 四阶段全绿（validate ✓ → 真实发布 isSuccess=true 写入 assets/ui/Demo ✓ → 三重证据 ✓ → ccc ui-smoke 运行时冒烟 ✓，exit 0；发布产物字节与源一致无 git diff）

## 7. codegraph 索引自动 ensure

- [x] 7.1 `tools/arch-viewer/lib/codegraph/gateway.ts` 新增 `ensureCodeGraphIndex()`：`.codegraph/codegraph.db` 缺失自动 `codegraph init`；存在时经 `status --json` 的 `index.reindexRecommended` 判定过期并自动重建；`--refresh` 强制重建；CLI 缺失时索引存在 → 容错继续使用、索引缺失 → 透传「codegraph CLI 未安装」类型化指引错误
- [x] 7.2 `cli.ts`：`ArchRunDeps` 增可选 `ensureIndex(forceRefresh)`，`run()` 启动分析器/服务前调用并透传 `--refresh`（`lib/args.ts` 新增该选项）；init 经 `log` 输出进度
- [x] 7.3 `tools/arch-viewer/test/ensure-index.test.ts` 7 用例：缺失自动 init、存在不重建、过期自动重建、`--refresh` 强制、CLI 缺失（缺失→抛指引错误/存在→容错）、init 非零退出抛 `CodeGraphCommandError`
- [x] 7.4 README 快速开始移除「人工 codegraph init」步骤，环境要求与门禁表改为「缺失/过期自动初始化，`--refresh` 强制重建」

## 8. 文档对齐

- [x] 8.1 `NOTE.md` 顶部加「历史方法论记录（2026-08）」横幅，指向 AGENTS.md/README/openspec/doc，正文保留
- [x] 8.2 `README.md` 门禁命令表增补 `bun run ai-sync`（arch 行同步更新为自动初始化说明）；`ui/generated` 修正见 8.3 的 AGENTS.md 字符串归口条目。**偏差：`verify:ui-loop` 未登记**——6.x 尚未实现（依赖 FGUI 编辑器 + Creator 环境），README 不登记不存在的命令，6.x 落地时补登记
- [x] 8.3 `AGENTS.md` 新增「AI 资产治理」章节：受管文件单一真源（registry）+ 禁止手改工具目录 + `sync --apply`/提交前 `check` 纪律；模型注册表与 `verify-models` 降级委派流程；UI spec 流程引用 spec-check；并修正字符串归口 `ui/generated/` → `assets/ui/generated/`

## 9. 门禁与收尾

- [x] 9.1 全部门禁本地跑绿：`bun run typecheck`（全链）、`bun run lint`、`bun run test`（foundation/fgui/fgui-mcp/arch/ai-sync/creator 全量）、`bun run fgui validate --strict`（Demo 抽查通过）、`bun run ai-sync check`（50 个受管文件一致）
- [x] 9.2 `openspec validate --specs --strict` 42/42 通过；无活跃 change；归档 proposal/specs/design/tasks 一致性已复核（delta → main spec 吸收一致，4.1 zod 实现偏差与 8.2 verify:ui-loop 未登记偏差均已记录）
- [x] 9.3 ADR 检查任务：**无需新 ADR**——本 change 的架构决策（AI 资产单一来源 registry 治理、UI spec 机器校验、codegraph 自动 ensure）已分别由 ADR-039 决策 1/2/4 覆盖；「发布验证闭环编排」决策由 ADR-039 决策 3 记录（6.x 落地时实现），本次实现批次未产生新的架构决策，明确记录于此
