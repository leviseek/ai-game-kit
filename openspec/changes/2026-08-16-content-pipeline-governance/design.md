# Design: 2026-08-16-content-pipeline-governance

## Context

现状（详见 proposal.md - Why）：`assets/game-content/auto-battle/` 8 张 JSON 配置表手写无校验；`name` 内嵌中文；无本地化管线。仓库已有可复用模式：`tools/fgui` 的 `lib/spec.ts` 手写校验器（硬 error/软 warning）、`gen-constants` 生成物逐字 freshness、`ai-sync` 的 workspace 结构、`checkTypeFreshness` 语义。设计目标是把这些模式平移到内容域，不发明新范式。

## Goals / Non-Goals

**Goals:**
- 配置表 schema 校验 + 跨表引用 + id 唯一 + 内嵌文本禁令（`bun run content validate`）。
- i18n 语言表 + 类型化常量生成（freshness）+ 跨语言完整性 + 占位符校验。
- 既有 8 张表 `name` 迁移为 i18n key；游戏侧经 `TextRepo` 消费。
- 零新增运行时依赖（`.ai/instructions.md` 第 3 条）。

**Non-Goals:**
- 外部生成器接入（美术/音频，P2）。
- CI 恢复（另立 change）。
- 不新增运行时依赖；不改 framework 核心（只增 `TextRepo` 到 game 公共层）。
- 资源校验限动画帧（unit-animations/explosion）；音频/其他资产存在性后续按同模式扩展。

## Decisions

### D1: 新增 workspace `tools/content`

新建 `tools/content`（Bun workspace，与 `tools/fgui` 同构）：`bun run content validate`（schema/引用/id/文本禁令 + i18n 完整性）与 `bun run content gen-i18n`（生成 `assets/game-content/generated/i18n.ts`）。

- **备选**：扩展现有 `tools/fgui`。否决——FGUI 是 UI 域，配置/文本是内容域，混入会污染 fgui 语义；内容管线未来承接资源校验/生成器接入，独立 workspace 更利于扩展。
- 结构：`lib/content.ts`（配置发现与 schema 注册）、`lib/validate.ts`（校验器）、`lib/i18n.ts`（语言表/常量生成/freshness）、`lib/schemas/`（每表一个 schema 模块）、`commands/validate.ts`、`commands/gen-i18n.ts`。

### D2: schema 机制（手写类型化校验器，对齐 lib/spec.ts）

每张表一个 TS schema 模块（`lib/schemas/<table>.ts`），导出：
- 表名与文件路径（`assets/game-content/auto-battle/<table>.json`）；
- 字段描述：`{ key, type: "string"|"number"|"boolean"|"enum"|"id"|"i18n-key"|"array"|"object", required?, min?, max?, enum? }`；
- 用户可见字段标记（`i18n-key` 类型）——`name`/`description` 等必须是本地化 key；
- 引用声明：`{ field, targetTable }`——跨表引用解析用目标表 id 索引。

校验器按描述遍历表条目，产出 `SpecIssue[]`（硬 error/软 warning 分级，复用 `lib/spec.ts` 的 issue 形态）。**不用 zod**（第 3 条禁止新增依赖），手写描述式校验——与 `lib/spec.ts` 完全同构，AI 新增表时按模板补 schema 模块即可。

### D3: 文本归口链路（配置 name → i18n key）

```text
配置 <table>.json 的 name/description 字段（i18n-key 类型）
  -> key 约定：auto_battle.<table>.<id>.<field>（如 auto_battle.buffs.attack-up.name）
  -> assets/game-content/i18n/zh-CN.json（主语言，key 权威）
  -> gen-i18n：生成 assets/game-content/generated/i18n.ts（key 联合类型 + TextRepo + 默认值表）
  -> validate：跨语言完整性 + 占位符一致性 + 生成物 freshness（对齐 checkConstantFreshness）
```

- `TextRepo`：`get(key): string`（主语言默认，可传语言参数）、`has(key)`；未知 key fail-fast（抛类型化错误，含最近相似 key 提示——对齐 spec「消费方 fail-fast」）。
- `generated/i18n.ts` 与 `assets/ui/generated` 同属「生成物禁止手改」，freshness 由 `content validate` 强制。

### D4: 迁移策略

- 8 张表 `name` 字段值抽到 `i18n/zh-CN.json`（key 按 D3 约定），配置 `name` 改为 key 字符串；`validate` 校验 name 是已声明 key（i18n-key 类型校验：格式 + 存在于语言表）。
- 游戏侧：`assets/samples/game_auto_battle/` 中读取 `name` 处改经 `TextRepo` 查找（展示层），领域层保持只消费 id/数值（`name` 不进领域模型）。
- 迁移与校验同步落地：先加 `validate` 的 i18n-key 校验 → 迁移配置 → 全绿提交（单 commit 便于 revert）。

### D5: 无新依赖与门禁接线

- `tools/content` devDependency 仅 `@types/node`；生成/校验全用 node:fs 与手写逻辑。
- 根 `package.json`：`content` script、`test:content` 接入 test 链、`typecheck` 链加 `tools/content/tsconfig.json`。
- README 门禁命令表增补 `bun run content <command>`。

### D6: 资产引用存在性校验（P0 二期）

`schema.assets` 声明（TableSchema 可选字段）：`{ bundleDir, dirField, prefixField, countField, imageExts? }`。校验器 `validateAssetFiles` 按条目展开期望帧文件 `assets/<bundleDir>/<dir>/<prefix>_<NN>.<ext>`（`NN` 两位补零，0..frameCount-1）：

- bundle 目录缺失 → `asset-bundle-missing`；子目录缺失 → `asset-dir-missing`；单帧缺失 → `asset-frame-missing`（含动画名与期望路径）。
- `prefixField` 值支持字符串（单前缀）或对象（`prefixByAnim` 式多前缀，遍历对象值）。
- `skill-effects` 的 `kind=explosion` 走专项 `validateExplosionFrames`：校验 `fx_explosion_00..11.png`（对齐 `view/animUrls.ts` 的 `EXPLOSION_FRAME_URLS` 12 帧约定）；无 explosion 条目给 warning 不阻断。
- 文件扩展默认 `png`（可扩展）；`assets/` 下与 `.meta` 文件无关（Cocos 的 .meta 不参与帧存在性判断）。

帧 URL 生成语义（`bundle://<bundle>/<dir>/<prefix>_<NN>`，见 animUrls.ts）与文件模板一致，校验即守护配置驱动的帧表与实际资源不漂移。

## Risks / Trade-offs

- [schema 描述式校验器手写量大（每表一个模块）] → 描述结构极简 + 模板化（AI 按模板补表）；先覆盖 auto-battle 8 表，新表按需添加，不追求一次全量。
- [配置迁移破坏既有玩法（name 读取处）] → 领域层不消费 name（已如此），仅展示层适配 TextRepo；fail-fast 保证缺 key 立即暴露而非运行时静默。
- [i18n key 与配置耦合（改名/删表需同步语言表）] → key 由 id 推导（`<table>.<id>.<field>`），表删则 validate 报多余 key warning，提示清理。
- [占位符一致性误报（翻译用词序不同）] → 只校验「命名占位符集合」一致（忽略顺序），允许语序调整。
- [generated 产物提交噪音] → 与 `assets/ui/generated` 同纪律：生成物入 git、freshness 门禁兜底，禁止手改。

## Migration Plan

1. `tools/content` 骨架 + `validate`（schema 校验器 + 8 表 schema）→ 对现状配置跑出首个基线问题清单。
2. i18n 管线上线：`gen-i18n` + `TextRepo` + freshness。
3. 迁移 8 表 `name` → key（zh-CN 表填充），`validate` 转绿。
4. 游戏侧展示层适配 TextRepo；全部门禁绿。
5. 单 commit 提交（便于 revert）；ADR 检查（见 tasks 末尾）。

## Open Questions

- 除中文外首批是否引入其他语言表（如 en-US）：可由用户决定，不改变 spec/设计/任务拆分（语言表数量是数据而非结构）。
