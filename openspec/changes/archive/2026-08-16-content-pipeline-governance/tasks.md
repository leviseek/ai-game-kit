# Tasks: 2026-08-16-content-pipeline-governance

## 1. tools/content 骨架与 schema 校验

- [x] 1.1 创建 `tools/content` workspace（package.json/tsconfig.json，devDependency 仅 `@types/node`），根 package.json `workspaces` 登记并新增 `content` script（`bun ./tools/content/cli.ts`）
- [x] 1.2 `lib/schemas/` 字段描述结构（type/required/min/max/enum/id/i18n-key/array/object + refTable 跨表引用）+ 8 表 schema（`effectId → skill-effects`、`heroes.baseAttributeId/skillId/animationId` 三处跨表引用；name 标 `i18n-key`）
- [x] 1.3 `lib/validate.ts`：按 schema 校验器（硬 error/软 warning 分级，issue 对齐 `lib/spec.ts`）；`commands/validate.ts` 接线 `bun run content validate`（非零退出）
- [x] 1.4 跨表引用校验（目标表 id 索引，悬空引用 error）+ 表内 id 唯一性
- [x] 1.5 首轮基线清单：15 个 `name` 内嵌文本 error（3 buffs + 6 heroes + 6 skills）+ i18n 未初始化 warning；schema/引用/id 校验零误报（迁移阶段统一修复）

## 2. 本地化管线

- [x] 2.1 `assets/game-content/i18n/zh-CN.json` 主语言表（15 key 权威）+ `en-US.json` 翻译表（验证跨语言校验）；`lib/i18n.ts`：语言表加载、key 集合/占位符提取（key 格式允许下划线/连字符段）
- [x] 2.2 `commands/gen-i18n.ts`：生成 `assets/game-content/generated/i18n.ts`（key 联合类型 + `TextRepo`（get 未知 key fail-fast 含最近相似 key / has / getOr）+ 主语言默认值表 + `text` 单例）；`content gen-i18n` script
- [x] 2.3 i18n 校验并入 `content validate`：跨语言完整性（缺 key error/多余 key warning）、命名占位符集合一致性（忽略顺序）、生成物逐字 freshness（对齐 `checkConstantFreshness`）
- [x] 2.4 配置内嵌文本禁令：`i18n-key` 字段值必须匹配 key 格式且存在于主语言表；内嵌中文/非 key 报 `embedded-text`/`i18n-key-unknown` error

## 3. 配置迁移与游戏侧适配

- [x] 3.1 迁移 8 表 `name` 为 i18n key（`auto_battle.<table>.<id>.name`），zh-CN/en-US 表填充；**同时迁移配置双源** `content/autoBattleTables.ts` 镜像表 15 处 name（一致性测试强制镜像 == JSON）；`content validate` 转绿
- [x] 3.2 展示层 `name` 读取处改经 `TextRepo`：view/presenter/lineup/VsEntrance/assembly/smoke 共 6 处用 `text.getOr(name, name)`（key→文案、非 key 原样透传，不静默空串）；领域层只承载 key 不消费文案（config.ts 不渲染）
- [x] 3.3 `TextRepo` 类型接线（key 联合类型 + I18nKey）；既有 UI 展示（VS 入场/编队/战斗日志/单位名）走 key 查文案；生成物禁止手改（freshness 兜底）

## 4. 门禁、文档与收尾

- [x] 4.1 `tools/content` 接入 `typecheck` 链与 `lint`；`test:content`（`bun test ./tools/content/test`）接入 test 链
- [x] 4.2 单测 17 用例：schema 分支（类型/枚举/范围/必填）、跨表悬空引用、id 重复、内嵌文本禁令、i18n-key 未知、i18n 完整性/占位符（顺序不敏感）、**真实生成物 TextRepo fail-fast**（最近相似 key）；fixture 驱动
- [x] 4.3 `AGENTS.md` 新增「内容管线」章节（配置纪律/内嵌文本禁令/文案消费）；`README.md` 门禁命令表增补 `bun run content <command>`
- [x] 4.4 全部门禁本地跑绿：typecheck（全链）/lint/全量 test（foundation 1308 + fgui + fgui-mcp + arch + ai-sync + creator + verify-ui-loop + content 17）/`content validate` 通过/`ai-sync check` 50 一致/`openspec validate --specs --strict` 42/42
- [x] 4.5 ADR 检查：**已创建 ADR-040**（内容管线治理：配置 schema 校验 + i18n 链路 + 核心 fail-fast/展示层 getOr 容错语义 + 配置双源治理）

## 5. 资源引用存在性校验（P0 二期）

- [x] 5.1 `TableSchema.assets`（AssetSpec）声明：`{ bundleDir, dirField, prefixField, countField, imageExts? }`；`unit-animations` schema 挂载 assets 标记
- [x] 5.2 `lib/asset-validation.ts`：`validateAssetFiles`（bundle/dir/帧文件存在性，prefix 支持单值或 prefixByAnim 对象）+ `validateExplosionFrames`（kind=explosion → fx_explosion_00..11，对齐 EXPLOSION_FRAME_URLS）；集成 `validateContent`
- [x] 5.3 单测 7 用例（asset-validation.test.ts：帧齐全/缺失帧/子目录缺失/bundle 缺失/爆炸帧齐全/缺失/无条目 warning）；**实机缺帧检出演练**：删除 warrior_m_death_09.png → validate 报 `asset-frame-missing`（含动画名与期望路径）+ exit 1，恢复后转绿
- [x] 5.4 ADR 检查：P0 二期决策并入 ADR-040（新增「资源引用存在性校验」决策，Non-Goals 同步移除该遗留项）
