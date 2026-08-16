## Purpose

提供用户可见文本的本地化管线：语言表（i18n/）、类型化常量生成（generated/i18n.ts）与跨语言完整性/占位符校验，使文案与代码/配置解耦且可机器回归。

## ADDED Requirements

### Requirement: i18n 语言表

系统 SHALL 提供 `assets/game-content/i18n/` 语言表：`zh-CN.json` 为主语言（key 权威），其余语言为翻译表；key 采用点分路径归口（如 `auto_battle.buffs.attack-up.name`）。

#### Scenario: 主语言表缺 key 被拦截

- **WHEN** 某翻译表缺失主语言中存在的 key
- **THEN** validate 报缺 key error 并列出缺失路径

#### Scenario: 多余 key 提示

- **WHEN** 某翻译表含主语言不存在的 key
- **THEN** validate 报多余 key warning（避免翻译残留）

### Requirement: 类型化常量生成

系统 SHALL 生成 `assets/game-content/generated/i18n.ts`：导出 key 联合类型、`TextRepo` 查找函数（主语言默认值）与全量 key 表；产物 SHALL 经逐字 freshness 校验（对齐 `gen-constants`），源语言表变更后未重跑生成 SHALL 报 error。

#### Scenario: 生成物过期被拦截

- **WHEN** `i18n/zh-CN.json` 增删 key 但未重跑生成
- **THEN** validate 报生成物过期 error（运行 `bun run content gen-i18n` 修复）

### Requirement: 占位符一致性

系统 SHALL 校验每个 key 的翻译中命名占位符（`{name}` 等）与主语言一致；缺参/多参/占位符名不一致 SHALL 报 error。

#### Scenario: 翻译占位符缺失被拦截

- **WHEN** 某 key 主语言含 `{count}` 而翻译表缺失该占位符
- **THEN** validate 报占位符不一致 error

### Requirement: 消费方 fail-fast

系统 SHALL 要求游戏侧通过 `TextRepo` 按 key 取文案；未知 key SHALL fail-fast（不静默回退空串）。

#### Scenario: 未知 key 抛错

- **WHEN** 游戏代码用未声明的 key 查询文案
- **THEN** `TextRepo` 抛出含 key 与最近相似 key 的类型化错误
