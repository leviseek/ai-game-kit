## Purpose

为 `assets/game-content/**/*.json` 数值配置提供确定性校验：schema 类型/范围、跨表引用解析、id 唯一性与内嵌可见文本禁令，使「AI 产出配置 → 机器校验 → 可回归」在内容域成立。

## ADDED Requirements

### Requirement: schema 校验

系统 SHALL 为每张配置表提供 TS 定义的 schema（字段类型/必填/枚举/数值范围），`bun run content validate` 按 schema 校验磁盘 JSON；违反 schema 的字段 SHALL 报 error 并以非零退出码结束。

#### Scenario: 类型错误被拦截

- **WHEN** `buffs.json` 中某条目的 `value` 为字符串而非数字
- **THEN** validate 报告该字段类型错误并以非零退出码结束

#### Scenario: 枚举越界被拦截

- **WHEN** `skills.json` 中某条目的 `target` 不在允许枚举内
- **THEN** validate 报 error 并列出合法取值

#### Scenario: 合法配置通过

- **WHEN** 全部配置满足各自 schema
- **THEN** validate 报告通过并以退出码 0 结束

### Requirement: 跨表引用校验

系统 SHALL 校验配置中的跨表引用（如 `skills.json` 的 `effectId` → `unit-animations.json` 的 id）：引用目标必须存在于目标表；悬空引用 SHALL 报 error。

#### Scenario: 悬空引用被拦截

- **WHEN** 某技能条目的 `effectId` 在 `unit-animations.json` 中不存在
- **THEN** validate 报 error 并给出引用方与缺失 id

### Requirement: id 唯一性

系统 SHALL 校验配置表内 id 唯一；同一表内重复 id、以及跨表语义 id 冲突（同一命名空间下不同含义）SHALL 报 error。

#### Scenario: 表内重复 id 被拦截

- **WHEN** 某表存在两条相同 id 的记录
- **THEN** validate 报 error 并列出重复 id 与行号

### Requirement: 内嵌可见文本禁令

系统 SHALL 校验用户可见字段（`name`、`description` 等，由 schema 声明）不得内嵌直接文案：值必须为本地化 key（匹配 `localization-pipeline` 的 key 格式）；内嵌中文或非 key 值 SHALL 报 error。

#### Scenario: 配置内嵌中文被拦截

- **WHEN** `buffs.json` 的 `name` 为「攻击强化」而非 i18n key
- **THEN** validate 报内嵌文本禁令 error，并提示迁移到 `assets/game-content/i18n/`

### Requirement: 资源引用存在性校验

系统 SHALL 校验配置声明的资产引用（如 `unit-animations` 表的 `dir`/`prefixByAnim`/`frameCount` → `assets/animations/<dir>/<prefix>_<NN>.png` 帧文件、`skill-effects` 的 `kind=explosion` → 爆炸序列帧）：bundle 目录、子目录与全部期望帧文件缺失 SHALL 报 error 并给出期望路径。

#### Scenario: 动画帧缺失被拦截

- **WHEN** `unit-animations.json` 的某条目 `frameCount=10` 但第 10 帧文件不存在
- **THEN** validate 报 `asset-frame-missing` error，指明动画名与期望路径

#### Scenario: 爆炸序列帧缺失被拦截

- **WHEN** `skill-effects.json` 含 `kind=explosion` 但 `fx_explosion_11.png` 不存在
- **THEN** validate 报缺失帧 error（对齐 `EXPLOSION_FRAME_URLS` 12 帧约定）

#### Scenario: 帧文件齐全通过

- **WHEN** 全部声明帧文件真实存在
- **THEN** validate 报告通过
