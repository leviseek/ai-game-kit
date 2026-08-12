## Purpose

将生成 URL 常量确立为 FUI 绑定链的唯一 URL 契约：`ui/generated` 的 URL 常量以 `FuiComponentUrl`（`ui://<包>/<组件>` 模板字面量）形态贯穿绑定链，注册表、创建路径与错误定位均消费该类型，禁止裸字符串与短 id。

## ADDED Requirements

### Requirement: 生成 URL 常量作为绑定链 URL 契约

`ui/generated` 的生成 URL 常量 SHALL 以 `FuiComponentUrl` 类型承载，作为绑定链唯一的 URL 来源：`@FUIBind` 首参数、注册表 `register/lookup` 与错误定位 SHALL 消费该类型，禁止业务代码散落裸 `ui://` 字符串或短 id 拼接。

#### Scenario: 常量静态类型为 FuiComponentUrl

- **WHEN** 组件导入 `ui/generated` 生成的 URL 常量并作为 `@FUIBind` 首参数
- **THEN** 该常量的静态类型为 `FuiComponentUrl`，可直接满足绑定 API 参数约束

#### Scenario: 注册表键为 URL 类型

- **WHEN** 调用 `FuiComponentRegistry.register/lookup`
- **THEN** 参数类型为 `FuiComponentUrl`，普通 string 不满足该类型，非规范字符串在编译期报错

### Requirement: URL 构造集中在单一内部工厂

从 package/resource 名称构造 `FuiComponentUrl` SHALL 仅经由内部 `createFuiComponentUrl(packageName, componentName)` 工厂完成，且该工厂不进入根公共导出；Adapter 创建路径 SHALL 在单一位置构造一次 URL，供注册表查询、错误与 binder 复用。

#### Scenario: 创建路径单点构造 URL

- **WHEN** Adapter 按 package + resName 创建绑定视图
- **THEN** 该创建路径内部仅调用一次 `createFuiComponentUrl`，后续查询、错误与 binder 均复用该值，无散落的类型断言

#### Scenario: 内部工厂不对外导出

- **WHEN** 检查框架根公共导出
- **THEN** `createFuiComponentUrl` 不在根导出白名单中，仅公开 `FuiComponentUrl` 类型
