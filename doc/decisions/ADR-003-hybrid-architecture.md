# ADR-003 Hybrid Gameplay Architecture


## 状态

Accepted


## 背景

Framework目标支持：

- RPG
- 卡牌
- 挂机
- 模拟经营
- 横版动作


不同类型游戏核心模型不同。


## 决策

采用Hybrid Architecture。


Framework不强制统一Gameplay模型。


根据Feature需求选择：

- OOP
- ECS
- State Machine
- Command Pattern
- Behavior Tree


例如：

战斗：
可以使用ECS


回合制：
可以使用Command


经营：
可以使用数据驱动模型


## 不采用纯ECS原因

纯ECS适合运行时模拟，
但不适合作为所有手游业务系统基础。


## 影响

优点：

- 灵活
- 适应多类型游戏


缺点：

- 需要团队明确边界


## 后续

Gameplay架构由具体Feature决定。