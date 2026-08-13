## Purpose

为静态 FGUI 页面提供声明式自动绑定视图：组件类以装饰器声明组件资源与点击绑定，字段经生成类型接口获得类型，框架在正确时机注入元素与注册交互，业务层不接触 fgui 引擎类型。

## ADDED Requirements

### Requirement: FUIBind 注册组件类

`@FUIBind(packageName, componentName)` SHALL 在类定义时把该组件（以"包 + 组件名"复合键）登记到组件注册表，供创建路径在实例化时解析到对应类。同一复合键重复登记 SHALL 视为错误。

#### Scenario: 类定义时登记

- **WHEN** 一个类以 `@FUIBind("Login", "LoginView")` 修饰
- **THEN** 注册表把 `ui://Login/LoginView` 与该类关联，创建路径可按复合键取到类

#### Scenario: 重复登记报错

- **WHEN** 两个类以相同的包 + 组件名修饰
- **THEN** 注册过程报错，指出重复登记的复合键

### Requirement: 字段自动注入与类型

被绑定组件的字段 SHALL 以 `_` + 元件名命名，类型由生成类型接口（declaration merging）提供，业务代码不得手写字段声明。框架 SHALL 在组件实例的子节点可用后（构造资源完成时）按字段描述注入元素，注入的元件 SHALL 包装为引擎无关的能力接口。

#### Scenario: 子节点可用后注入

- **WHEN** 组件实例化且其子节点已构建完成
- **THEN** 该实例上所有 `_` + 元件名字段已被注入对应能力接口对象

#### Scenario: 字段类型来自生成接口

- **WHEN** 业务代码访问 `this._txt_status`
- **THEN** 其类型为生成接口声明的能力接口类型（如 TypedTextNode），而非 fgui 引擎类型

#### Scenario: 绑定缺失快速失败

- **WHEN** 生成类型声明了某字段，但运行时对应元件不存在
- **THEN** 初始化阶段抛错（开发期 fail-fast），不静默保留 undefined 字段

### Requirement: FClick 点击绑定

`@FClick(nodeName)` 修饰私有方法 SHALL 收集节点名与原型方法引用元数据；框架在实例初始化阶段把该方法绑定到实例并注册到对应元件的点击事件，点击时以该实例为 `this` 调用。节点名 SHALL 受生成节点名联合类型约束。

#### Scenario: 点击以实例为 this 调用

- **WHEN** 用户点击被 `@FClick("btn_login")` 绑定的元件
- **THEN** 对应方法以组件实例为 `this` 被调用

#### Scenario: 节点名类型约束

- **WHEN** `@FClick` 参数传入不在生成节点名联合中的名字
- **THEN** 编译期报错

### Requirement: 视图生命周期

绑定视图 SHALL 提供 dispose：退订 Store 订阅、移除全部已注册点击监听；重复 dispose 幂等；dispose 后不再响应点击与状态变化。

#### Scenario: dispose 清理订阅与监听

- **WHEN** 视图被 dispose
- **THEN** 其 Store 订阅与全部点击监听被移除，后续 dispatch 与点击不产生任何视图副作用

#### Scenario: 重复 dispose 幂等

- **WHEN** 视图 dispose 被重复调用
- **THEN** 不抛错且无副作用

### Requirement: 单向数据流约束

绑定视图 SHALL 遵循单向数据流：状态经"Store → ViewModel 投影 → 视图字段写入"下行；用户交互经 `@FClick` 方法 dispatch action 上行。SHALL 禁止双向绑定；输入控件取值 SHALL 在 action 构造时经能力接口读值，不作为绑定数据源。

#### Scenario: 状态下行到视图字段

- **WHEN** Store 状态变化且经投影产生新 ViewModel
- **THEN** 视图对应字段被更新为投影后的值

#### Scenario: 交互上行派发动作

- **WHEN** 用户点击触发 `@FClick` 方法
- **THEN** 该方法按需经能力接口读输入值并 dispatch 对应 action

#### Scenario: 输入不反向绑定

- **WHEN** 用户编辑输入控件内容
- **THEN** 输入值不自动写回 Store/ViewModel，仅在使用时读取

### Requirement: 业务层不持引擎类型

绑定视图与业务代码 SHALL 只依赖引擎无关的能力接口（TypedTextNode/TypedButtonNode/TypedInputNode 等），不 import fgui 引擎类型；能力接口实现 SHALL 位于 Adapter 边界按能力 kind 分派。

#### Scenario: 业务代码无 fgui 导入

- **WHEN** 业务视图代码访问其绑定字段或注册点击
- **THEN** 其源码不 import 任何 fgui/cc 引擎类型，仅使用能力接口
