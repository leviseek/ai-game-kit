# view-model-rendering Specification

## Purpose

提供通用的 ViewModel→视图自动 diff 渲染管线：游戏层定义可观察 ViewModel 与绑定声明，渲染器在状态变化时自动 diff 并只更新变化的视图节点，让品类页面呈现与引擎/框架解耦。

## Requirements

### Requirement: ViewModel 可观察状态

渲染管线 SHALL 提供可观察状态容器（Bindable），支持读取、写入与订阅变化；写入新值触发订阅者回调，重复写入相同值不触发。

#### Scenario: 读取与写入

- **WHEN** 调用方读取 Bindable 当前值
- **THEN** 返回最近一次写入的值

#### Scenario: 订阅变化

- **WHEN** Bindable 值变化且存在订阅者
- **THEN** 订阅回调收到新值

#### Scenario: 相同值不触发

- **WHEN** 写入与当前值相同的值
- **THEN** 订阅回调不被触发

### Requirement: 绑定声明

渲染管线 SHALL 支持声明式绑定：把 ViewModel 字段映射到视图节点（文本 text、进度 progress、显隐 visible、点击 command）；绑定声明是纯数据，不依赖引擎或 fgui。

#### Scenario: 声明文本绑定

- **WHEN** 绑定声明把 VM 字段映射到节点 text
- **THEN** 渲染时该节点显示 VM 字段格式化后的文本

#### Scenario: 声明进度绑定

- **WHEN** 绑定声明把 VM 数值字段映射到节点 progress
- **THEN** 渲染时该节点进度值等于 VM 字段数值（归一化 0..1）

#### Scenario: 声明显隐绑定

- **WHEN** 绑定声明把 VM 布尔字段映射到节点 visible
- **THEN** 渲染时该节点显隐随 VM 布尔值

#### Scenario: 声明点击命令

- **WHEN** 绑定声明把 VM 命令映射到节点点击
- **THEN** 视图节点被点击时命令回调被执行

### Requirement: 自动 diff 渲染

渲染器 SHALL 在 ViewModel 变化时自动渲染，且只更新值变化的绑定对应节点；同一节点绑定多字段时按字段独立判断。

#### Scenario: 变化字段单独更新

- **WHEN** ViewModel 中一个字段变化而其它字段不变
- **THEN** 仅变化字段对应的节点被更新，其余节点不更新

#### Scenario: 全量渲染

- **WHEN** 首次 setViewModel 或显式全量刷新
- **THEN** 所有绑定节点按当前 VM 值渲染

### Requirement: 视图节点接缝

渲染管线 SHALL 通过引擎边界接缝访问视图节点，fgui/cc 类型只存在于 adapter 边界；游戏层与核心渲染器不接触 fgui/cc。

#### Scenario: 节点访问解耦

- **WHEN** 渲染器经接缝读取/写入视图节点
- **THEN** 渲染器自身不导入 fgui/cc，节点读写由接缝实现

### Requirement: 生命周期清理

渲染器 SHALL 提供 dispose，释放订阅与绑定；重复 dispose 幂等；dispose 后不再触发渲染。

#### Scenario: dispose 清理订阅

- **WHEN** 渲染器 dispose 后 ViewModel 变化
- **THEN** 不再触发任何节点更新

#### Scenario: 重复 dispose 幂等

- **WHEN** 渲染器 dispose 被重复调用
- **THEN** 不抛错且无副作用

### Requirement: 未知节点容错

渲染器 SHALL 在绑定指向不存在的视图节点时优雅处理（不抛错、不中断其它绑定渲染）。

#### Scenario: 未知节点不中断

- **WHEN** 某个绑定的节点名在视图中不存在
- **THEN** 渲染器跳过该绑定，其它绑定正常渲染
