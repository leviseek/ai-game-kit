# 2026-08-16-content-pipeline-governance

## Why

「AI 全流程产出」的瓶颈在非代码资产管线。P0 第一步：把**数值配置**与**用户可见文本**变成 spec 驱动的可校验资产——与既有 FGUI spec-check 同构，让「AI 产出 → 机器校验 → 可回归」的确定性纪律从 UI 域扩展到内容域。

现状（`assets/game-content/auto-battle/` 8 张 JSON 配置表）：手写且无 schema 校验——字段拼错/类型错误/数值越界/id 悬空引用/跨表引用断裂（如 `skills.json` 的 `effectId` → `unit-animations.json`）均无机器拦截；`name` 字段直接内嵌中文（「攻击强化」「火球」等用户可见文本），多语言与文案复用无管线，违背 AGENTS.md 字符串归口纪律。

## What Changes

- 新增 `tools/content` workspace：`bun run content validate` 校验 `assets/game-content/**/*.json`——
  - **schema 校验**：每张表有 TS 定义的 schema（类型/必填/枚举/数值范围），手写校验器（对齐 `lib/spec.ts` 模式，`.ai/instructions.md` 第 3 条禁止新增运行时依赖）；
  - **跨表引用校验**：`effectId` 等跨表引用必须解析到目标表真实 id；
  - **id 唯一性**：表内 id 重复、跨表语义 id 冲突均 error；
  - **内嵌可见文本禁令**：`name`/`description` 等用户可见字段不得内嵌中文（或任何非 key 值），必须引用本地化 key；
  - **资源引用存在性校验（P0 二期）**：`unit-animations` 的 `dir`/`prefixByAnim`/`frameCount` → `assets/animations/<dir>/<prefix>_<NN>.png` 帧文件、`skill-effects` 的 `kind=explosion` → 爆炸序列帧，缺失报 error。
- **本地化管线**：
  - `assets/game-content/i18n/`：`zh-CN.json`（主语言）+ 各语言表；key 点分路径归口（如 `auto_battle.buffs.attack-up.name`）；
  - 生成类型化 TS 常量（对齐 `gen-constants` 模式）：`assets/game-content/generated/i18n.ts`（key 联合类型 + 主语言默认值），freshness 逐字校验；
  - 校验：跨语言 key 完整性（缺 key error）、占位符一致性（`{n}` 等参数跨语言一致）、配置内嵌文本禁令。
- **迁移**：既有 8 张表的 `name` 抽到 i18n 表，配置保留 key；游戏侧读取适配（`TextRepo` 按 key 取文案，缺 key fail-fast）。
- **纪律升级**：AGENTS.md 字符串归口规则扩展——用户可见文本（UI 文案/配置 name/描述）一律进 i18n 表，禁止配置内嵌中文。

## Capabilities

### New Capabilities

- `content-config-validation`: 数值配置的 schema 校验、跨表引用校验、id 唯一性与内嵌可见文本禁令。
- `localization-pipeline`: i18n 语言表、类型化常量生成与 freshness、跨语言完整性、占位符一致性校验。

### Modified Capabilities

- 无（本 change 引入全新能力；文本归口纪律在 AGENTS.md 层升级，不修改既有 spec 行为）。

## Impact

- 新增 workspace：`tools/content`（devDependency 仅 `@types/node`）。
- `assets/game-content/`：新增 `i18n/`、`generated/`；既有 8 张表 `name` 字段迁移为 i18n key。
- 游戏代码：`assets/samples/game_auto_battle/` 读取配置 `name` 处适配为 `TextRepo` 查找（默认回退主语言）。
- 文档：`AGENTS.md`（字符串归口升级）、`README.md`（门禁命令表增补 `bun run content validate`）。
- **Non-Goals（后续阶段，本 change 不做）**：外部生成器接入（美术/音频，P2）；CI 恢复（另立 change）；框架层配置热更/版本化（`versioned-storage` 已覆盖存档域，不扩展）。资源存在性校验已随 P0 二期纳入本 change。
