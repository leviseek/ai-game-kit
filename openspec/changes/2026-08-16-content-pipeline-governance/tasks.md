# Tasks: 2026-08-16-content-pipeline-governance

## 1. tools/content 骨架与 schema 校验

- [ ] 1.1 创建 `tools/content` workspace（package.json/tsconfig.json，devDependency 仅 `@types/node`），根 package.json `workspaces` 登记并新增 `content` script（`bun ./tools/content/cli.ts`）
- [ ] 1.2 `lib/schemas/` 模板与 8 表 schema：定义字段描述结构（type/required/min/max/enum/id/i18n-key/array/object）+ `base-attributes/battle-setup/buffs/heroes/skill-conditions/skill-effects/skills/unit-animations` 各表 schema（含用户可见字段 `i18n-key` 标记与跨表引用声明 `effectId → unit-animations` 等）
- [ ] 1.3 `lib/validate.ts`：按 schema 遍历表条目的校验器（硬 error/软 warning 分级，issue 形态对齐 `lib/spec.ts`）；`commands/validate.ts` 接线 `bun run content validate`（非零退出）
- [ ] 1.4 跨表引用校验：构建目标表 id 索引，悬空引用报 error；表内 id 唯一性校验
- [ ] 1.5 对现状 8 表跑首轮 validate，输出基线问题清单（记录于交付说明，不作为修复目标——迁移阶段统一处理）

## 2. 本地化管线

- [ ] 2.1 `assets/game-content/i18n/zh-CN.json` 主语言表（key 权威，空表起步）；`lib/i18n.ts`：语言表加载、key 集合/占位符提取
- [ ] 2.2 `commands/gen-i18n.ts`：生成 `assets/game-content/generated/i18n.ts`（key 联合类型 + `TextRepo`（get/has，未知 key fail-fast 含最近相似 key 提示）+ 主语言默认值表）；`content gen-i18n` script
- [ ] 2.3 i18n 校验并入 `content validate`：跨语言完整性（缺 key error/多余 key warning）、命名占位符集合一致性（忽略顺序）、生成物逐字 freshness（对齐 `checkConstantFreshness`）
- [ ] 2.4 配置内嵌文本禁令：schema 中 `i18n-key` 类型字段的值必须匹配 key 格式且存在于语言表；内嵌中文/非 key 报 error

## 3. 配置迁移与游戏侧适配

- [ ] 3.1 迁移 8 表 `name` 字段为 i18n key（`auto_battle.<table>.<id>.name`），zh-CN 表填充原中文文案；`content validate` 转绿
- [ ] 3.2 `assets/samples/game_auto_battle/` 展示层 `name` 读取处改经 `TextRepo` 查找；领域层确认不消费 name（保持只读 id/数值）
- [ ] 3.3 `TextRepo` 落位与类型接线（key 联合类型推导，禁止裸字符串查询）；既有 UI 展示（状态栏/技能名等）走 key

## 4. 门禁、文档与收尾

- [ ] 4.1 `tools/content` 接入 `typecheck` 链与 `lint`；`test:content`（`bun test ./tools/content/test`）接入 test 链
- [ ] 4.2 单测：schema 校验分支（类型/枚举/范围）、跨表悬空引用、id 重复、内嵌文本禁令、i18n 完整性/占位符/生成物 freshness、TextRepo fail-fast（fixture 驱动）
- [ ] 4.3 `AGENTS.md` 字符串归口升级（用户可见文本一律进 i18n 表，禁止配置内嵌中文）；`README.md` 门禁命令表增补 `bun run content <command>`
- [ ] 4.4 全部门禁本地跑绿（typecheck/lint/test/`content validate`/`ai-sync check`/`openspec validate --specs --strict`）
- [ ] 4.5 ADR 检查任务：change 完成前检查本次工作是否产生新的架构决策（候选：内容域确定性校验体系、i18n key 归口链路）；如有按 `doc/decisions/ADR-NNN-<slug>.md` 约定创建 ADR；如无，明确记录无需 ADR
