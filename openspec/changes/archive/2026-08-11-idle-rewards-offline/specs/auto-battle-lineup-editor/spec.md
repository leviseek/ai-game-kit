# auto-battle-lineup-editor Specification (Delta)

## ADDED Requirements

### Requirement: 编队数据可供挂机收益消费

`game_auto_battle` SHALL 将玩家编队作为挂机收益速率的可选输入：挂机系统读取当前编队的非空槽位数量（或其它定义好的编队属性）计算收益速率时，读取 MUST NOT 修改编队存档；编队存档 schema 版本化保证挂机系统可跨版本兼容消费。编队读取失败或损坏时，挂机系统 MUST 回退到固定默认速率而非失败中断。

#### Scenario: 挂机收益按编队规模加权

- **WHEN** 玩家编队中有 N 个非空槽位且挂机配置为按编队规模加权
- **THEN** 挂机收益速率基于非空槽位数 N 计算，且读取编队不修改编队存档

#### Scenario: 编队读取失败回退默认速率

- **WHEN** 挂机结算时读取编队存档失败或存档损坏
- **THEN** 挂机结算回退到固定默认速率，不中断收益结算
