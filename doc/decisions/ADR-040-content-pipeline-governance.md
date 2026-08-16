# ADR-040: Content Pipeline Governance — Config Schema Validation and Localization

## Status

Accepted

## Context

「AI 全流程产出」的瓶颈在非代码资产管线。P0 第一步（落地 change：`2026-08-16-content-pipeline-governance`）：把数值配置与用户可见文本变成 spec 驱动的可校验资产，让既有 UI 域的确定性纪律（FGUI spec-check）扩展到内容域。

现状问题：

1. `assets/game-content/auto-battle/` 8 张 JSON 配置表手写无 schema 校验——字段类型/枚举/数值范围、跨表引用（`skills.effectId → skill-effects`、`heroes.baseAttributeId → base-attributes` 等）、id 唯一性均无机器拦截。
2. `name` 字段直接内嵌中文（「攻击强化」「火球」等），无本地化管线，违背 AGENTS.md 字符串归口纪律。
3. **配置双源**：`assets/samples/game_auto_battle/content/autoBattleTables.ts` 是代码内嵌的静态表镜像，与 JSON 双份维护，靠一致性测试兜底。

## Decision

### 1. tools/content workspace（内容域确定性校验）

新增独立 workspace `tools/content`（与 `tools/fgui` 同构）：`bun run content validate` 校验 `assets/game-content/**/*.json`——

- **schema 校验**：每表一个 TS schema 模块（字段描述结构：type/required/min/max/enum/id/i18n-key/array/object + 跨表引用声明），**手写描述式校验器**（`.ai/instructions.md` 第 3 条禁止第三方运行时依赖，不用 zod，与 `lib/spec.ts` 同构）；
- **跨表引用解析**：`refTable` 字段值必须存在于目标表 id 索引，悬空引用 error；
- **id 唯一性**：表内主键重复 error；
- **内嵌文本禁令**：`i18n-key` 类型字段值必须为本地化 key（格式 + 主语言存在性），内嵌中文/非 key error。

### 2. 本地化管线（i18n）

- 语言表 `assets/game-content/i18n/`：`zh-CN.json` 主语言（key 权威）+ 翻译表；**key 由 id 推导**（`auto_battle.<table>.<id>.<field>`），表删/改名自动暴露多余 key，降低 key 维护漂移；
- `bun run content gen-i18n` 生成 `assets/game-content/generated/i18n.ts`：key 联合类型 + 主语言默认值表 + `TextRepo`；生成物逐字 freshness 由 `content validate` 强制（对齐 gen-constants）；
- 跨语言完整性（缺 key error/多余 key warning）与命名占位符集合一致性（忽略顺序）。

### 3. 文案消费语义：核心 fail-fast + 展示层容错

- `TextRepo.get(key)`：**未知 key fail-fast**（抛 `TextNotFoundError`，含最近相似 key 提示，不静默回退空串）；
- 展示层用 `text.getOr(name, name)`：**key → 文案，非 key（遗留/外部/测试数据）→ 原样透传**。理由：展示层输入契约是「name 可能是 key 也可能是任意字符串」，单条坏数据不应崩溃视图；`get` 的 fail-fast 保留给明确 key 语义的调用方。spec 的「不静默回退空串」由 getOr 的原文回退满足（回退非空串）。

### 4. 配置双源治理

`autoBattleTables.ts` 镜像表的 `name` 与 JSON 同步迁移为 key（镜像 == JSON，由 `game-auto-battle-tables-consistency` 测试强制），领域层只承载 key 不消费文案，展示层经 `TextRepo` 取文案。

## Consequences

- **tools/content**：新增 workspace + validate/gen-i18n 命令；8 表 schema；接入 typecheck/lint/test 门禁。
- **内容数据**：8 张配置表 `name` 迁移为 i18n key；`assets/game-content/i18n/`（zh-CN + en-US）与 `generated/i18n.ts` 新增。
- **游戏代码**：`samples/game_auto_battle` 展示层（view/presenter/lineup/VsEntrance/assembly/smoke）经 `text.getOr` 取文案；`autoBattleTables.ts` 镜像同步。
- **文档**：AGENTS.md 新增「内容管线」章节（配置纪律/内嵌文本禁令/文案消费）；README 门禁表增补 `bun run content`。
- **Non-Goals（记录，后续阶段）**：配置引用的美术/动画资源存在性校验（P0 二期）；外部生成器接入（美术/音频，P2）；CI 恢复（另立 change）；新增运行时依赖（无）。
