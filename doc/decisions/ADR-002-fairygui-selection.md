# ADR-002 FairyGUI UI技术选型

## 状态

Accepted

## 背景

目标Framework需要支持：

- RPG
- 卡牌
- 挂机
- 模拟经营
- 横版格斗

这些游戏通常包含大量：

- 页面
- 弹窗
- 列表
- 活动界面
- 商城
- 背包

需要UI与游戏逻辑解耦。

## 决策

采用 FairyGUI 作为主要UI解决方案。

架构：

Game Logic

↓

ViewModel

↓

UI Framework

↓

FairyGUI

Cocos原生UI不作为主要游戏UI方案。

## 原因

1. UI与逻辑分离

2. 美术可以独立使用FairyGUI编辑器

3. 更适合复杂手游UI结构

4. 支持组件化和Package管理

## 影响

优点：

- UI工程化能力增强
- 降低程序和美术耦合

缺点：

- 增加一个UI运行时依赖
- 需要维护Adapter层

## 后续

所有游戏UI必须通过UI Framework管理。
