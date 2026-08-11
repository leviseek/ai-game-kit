# auto-battle-lineup-editor Specification

## Purpose

让自动战斗（`game_auto_battle`）在开战前可通过点击选择编辑上阵编队：候选英雄池（HeroPool）为静态配置、玩家编队（Lineup）为可变状态并经 versioned-storage 持久化；开战时由编队实例化战斗单位到布阵区对应格，战斗实例化后与存档编队解耦。

## Requirements

### Requirement: 候选英雄池静态配置

`game_auto_battle` SHALL 提供候选英雄池（hero pool），包含英雄 id、名称、属性、站位与技能等配置，作为不可变静态配置；初始编队引用池内英雄，配置校验拒绝引用不存在或非法槽位的英雄。

#### Scenario: 候选英雄列表可用

- **WHEN** 加载编队数据模型
- **THEN** 候选英雄池提供完整英雄清单，供编队页面展示候选英雄区

#### Scenario: 引用非法英雄被拒绝

- **WHEN** 配置中的编队引用了英雄池中不存在的英雄 id
- **THEN** 配置解析拒绝该编队，不进入编队编辑

### Requirement: 玩家编队可变

`game_auto_battle` SHALL 提供玩家编队（lineup）作为可变状态：编队为槽位序列（slot → hero id）；玩家可通过点击选择操作填充空槽、替换已占槽、卸下已上阵英雄；上阵单位数不得超过实际上阵上限（`MAX_TEAM_SIZE`，默认 6）。

#### Scenario: 点击候选英雄填入空槽

- **WHEN** 玩家在编队页点击一个未上阵的候选英雄且存在空槽
- **THEN** 该英雄被填入空槽，编队槽位序列更新

#### Scenario: 点击候选英雄替换已占槽

- **WHEN** 玩家点击一个未上阵的候选英雄且选中了已占槽
- **THEN** 该槽位的原英雄被替换为新英雄

#### Scenario: 点击已上阵英雄卸下

- **WHEN** 玩家点击已上阵的英雄
- **THEN** 该英雄从编队卸下，槽位变为空

#### Scenario: 上阵数量受限

- **WHEN** 玩家尝试上阵超过实际上阵上限的英雄
- **THEN** 编队拒绝超出上限的填充，上阵数不超过 `MAX_TEAM_SIZE`

### Requirement: 编队持久化与恢复

`game_auto_battle` SHALL 将玩家编队经 versioned-storage 持久化并恢复：编队修改后落盘；重启应用后恢复上次编队；存档 schema 版本化，字段变更走迁移。

#### Scenario: 编队修改后持久化

- **WHEN** 玩家修改编队（填充/替换/卸下）
- **THEN** 编队状态被持久化，版本号与 schema 一致

#### Scenario: 重启后恢复编队

- **WHEN** 应用重启后进入编队页面
- **THEN** 页面恢复上次持久化的编队

#### Scenario: schema 版本迁移

- **WHEN** 读取到旧版本 schema 的编队存档
- **THEN** 按迁移规则升级到当前 schema 后恢复，不丢失既有编队

### Requirement: 从编队开战

`game_auto_battle` SHALL 在开战时由玩家编队实例化战斗单位到布阵区对应格；战斗实例化后与编队解耦——战斗内单位状态变化不影响存档编队。

#### Scenario: 开战单位与编队一致

- **WHEN** 玩家以当前编队开始一场战斗
- **THEN** 双方上阵单位与编队槽位序列一致，并实例化到布阵区对应格

#### Scenario: 战斗内修改不影响存档

- **WHEN** 战斗进行中存档编队被修改或战斗单位状态变化
- **THEN** 存档编队与战斗实例相互独立，互不影响
