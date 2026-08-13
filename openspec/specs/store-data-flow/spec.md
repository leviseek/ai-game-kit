# store-data-flow Specification

## Purpose

提供轻量 Store 数据流原语：不可变 State + 纯 reducer/action + 订阅，经组合根注入，作为静态页面单向数据流的状态源，使状态到视图的同步有统一、可测试的路径。

## Requirements

### Requirement: createStore 原语

Store SHALL 提供工厂 `createStore(reducer, initialState)`，返回 `getState()`/`dispatch(action)`/`subscribe(listener)` 与 `dispose()`。state 变更后订阅监听器收到新 state。Store 本身 SHALL 与引擎无关（不依赖 fgui/cc）。

#### Scenario: 读取当前状态

- **WHEN** 调用方读取 store 当前状态
- **THEN** 返回最近一次 dispatch 之后的状态

#### Scenario: 派发动作更新状态

- **WHEN** 调用方 dispatch 一个 action
- **THEN** reducer 以当前状态与 action 计算新状态，订阅监听器收到该新状态

#### Scenario: 订阅与退订

- **WHEN** 监听器经 subscribe 注册，随后经返回句柄退订
- **THEN** 退订后该监听器不再被后续 dispatch 触发

### Requirement: 纯 reducer 不可变更新

Reducer SHALL 是纯函数 `(state, action) => newState`：不修改入参 state，返回新 state 对象；相同输入必得相同输出。State 中变化的字段应产生新引用，未变化部分保持原引用。

#### Scenario: 不变性保证

- **WHEN** reducer 处理一个 action
- **THEN** 入参 state 不被修改，返回的新 state 为不同引用

#### Scenario: 未变化部分保持引用

- **WHEN** reducer 只更新 State 的局部字段
- **THEN** 新 state 中未变化的字段与原 state 保持同一引用

### Requirement: 动作类型化

Action SHALL 以判别联合表达，经常量表（`as const` 对象 + 联合类型）归口，禁止裸字符串 action type 散落各处。

#### Scenario: 类型化 action 分发

- **WHEN** 调用方经常量表构造并 dispatch 一个 action
- **THEN** action 的 type 与载荷受类型约束，拼错 type 在编译期报错

### Requirement: Store 生命周期

Store SHALL 提供 dispose，释放全部订阅；重复 dispose 幂等；dispose 后 dispatch 不再通知任何监听器。

#### Scenario: dispose 后不再通知

- **WHEN** store 被 dispose 后 dispatch 一个 action
- **THEN** 无任何监听器被触发，且不抛错

#### Scenario: 重复 dispose 幂等

- **WHEN** store 的 dispose 被重复调用
- **THEN** 不抛错且无副作用
