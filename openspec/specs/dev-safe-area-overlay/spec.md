# dev-safe-area-overlay Specification

## Purpose

在开发环境下可视化显示屏幕安全区（safe area）边界，帮助开发者核对真实安全区 inset 与适配后 UI 坐标的对应关系，框随屏幕缩放/拉伸实时跟随。

## Requirements

### Requirement: 安全区框仅面板展开时显示

安全区框 SHALL 仅在与悬浮球信息面板展开时同时显示，面板收起后隐藏；显示/隐藏 MUST 与面板展开状态联动，不产生独立于面板的常驻可见性。

#### Scenario: 面板展开时显示安全区框

- **WHEN** 悬浮球信息面板展开
- **THEN** 安全区虚线框可见

#### Scenario: 面板收起时隐藏安全区框

- **WHEN** 悬浮球信息面板收起
- **THEN** 安全区虚线框隐藏

### Requirement: 黄色虚线可视化

安全区框 SHALL 以黄色虚线矩形显示，虚线形态由像素图资源承载（非 XML graph 节点），矩形边界与当前安全区 inset 对齐。

#### Scenario: 安全区框为黄色虚线

- **WHEN** 安全区框可见
- **THEN** 显示为黄色虚线矩形，四边贴合安全区边界

### Requirement: 安全区框随屏幕缩放/拉伸跟随

安全区框的位置与尺寸 SHALL 基于实时读取的安全区 inset 与 UI 根容器（GRoot）尺寸计算；屏幕缩放/拉伸后框 MUST 跟随更新，不得使用挂载时缓存的快照值。

#### Scenario: 窗口缩放后框跟随更新

- **WHEN** 窗口缩放/拉伸导致 GRoot 尺寸或安全区 inset 变化
- **THEN** 安全区框更新为新边界，值未变化时不产生无效重绘

### Requirement: 仅开发环境启用

安全区框 SHALL 仅随 dev overlay 在开发环境启用，release 构建不创建框、不采样、无任何 UI 开销。

#### Scenario: 开发环境显示

- **WHEN** 应用运行于开发环境且悬浮球面板展开
- **THEN** 安全区框可见

#### Scenario: 非开发环境无残留

- **WHEN** 应用运行于 release 构建
- **THEN** 不创建安全区框，无任何残留
