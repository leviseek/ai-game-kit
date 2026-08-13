# ADR-005 Framework Game Boundary

## 状态

Accepted

## 背景

Framework需要支持多个不同类型游戏。

如果Framework包含：

- Hero
- Item
- Skill
- Quest

会导致框架变成具体游戏模板。

## 决策

Framework只提供基础能力。

Framework负责：

- 生命周期
- UI
- 资源
- 场景
- 存档
- 配置
- 日志

Game负责：

- 角色
- 战斗
- 卡牌
- 任务
- 经济

## 规则

Framework禁止依赖Game。

Game允许依赖Framework。

## 影响

Framework保持稳定。

Game Feature可以快速变化。
