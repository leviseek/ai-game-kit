# ADR-001 Framework 生命周期设计

## 状态

Accepted

## 日期

2026-08-01


## 背景

游戏项目需要一个统一的启动流程。

Cocos Creator默认提供场景生命周期，
但大型手游需要管理：

- Framework初始化
- 服务启动
- 模块加载
- 游戏入口切换


如果每个系统自行初始化，会导致：

- 初始化顺序不可控
- 全局状态混乱
- 模块之间产生隐式依赖


## 决策

采用：

Boot Scene + AppRoot + Application 生命周期模型。


流程：

startup.scene

↓

AppRoot

↓

Application.initialize()

↓

Framework Modules

↓

Game Entry


Application作为运行时生命周期管理中心。


## 不采用方案

### 每个Manager自行初始化

原因：

容易形成：

GameManager
UIManager
ResourceManager

之间相互调用。


### 完全依赖Cocos生命周期

原因：

Cocos生命周期不足以描述完整手游运行流程。


## 影响

优点：

- 生命周期明确
- 模块可控
- 便于测试


缺点：

- 增加初始化设计成本


## 后续

所有Framework模块必须通过Application生命周期接入。