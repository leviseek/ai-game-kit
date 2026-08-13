# ADR-004 Resource Management Strategy

## 状态

Accepted

## 背景

手游资源规模较大。

需要支持：

- 分包
- 加载
- 释放
- FairyGUI Package

避免所有资源进入resources目录。

## 决策

采用Bundle First资源策略。

资源访问必须通过：

IResourceProvider

禁止业务代码直接调用：

assetManager.loadBundle()

## Bundle规划

boot

启动资源

common

公共资源

ui

UI资源

audio

音频资源

game-content

游戏内容资源

## 影响

优点：

- 生命周期清晰
- 支持扩展

缺点：

- 初期管理成本增加
