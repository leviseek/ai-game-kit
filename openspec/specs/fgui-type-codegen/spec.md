# fgui-type-codegen Specification

## Purpose

从 FGUI 组件源 XML 生成确定性的类型描述产物（字段描述、节点名联合、declaration merging interface），让 UI 代码对元件名/元件类型的访问获得编译期类型安全，并保证生成产物与源 XML 一致。

## Requirements

### Requirement: gen-types 生成类型描述产物

FGUI 类型生成器 SHALL 为每个包的 exported 组件解析其 XML `displayList`，生成三份产物到 `assets/ui/generated/`：组件字段描述（字段名 → 能力 kind）、节点名字面量联合、与组件类同名的 declaration merging interface。生成产物 SHALL 带"禁止手改、源变更后重跑"的注释头。

#### Scenario: 生成字段描述

- **WHEN** 组件 `LoginView.xml` 的 displayList 含 `txt_status`（文本）、`btn_login`（按钮）、`bar_progress`（进度条）
- **THEN** 生成产物包含 `LoginView` 的字段描述，声明 `_txt_status`/`_btn_login`/`_bar_progress` 及其能力 kind

#### Scenario: 生成节点名字面量联合

- **WHEN** 组件 displayList 含若干已命名元件
- **THEN** 生成产物包含该组件的节点名联合类型（如 `type LoginViewNodes = "txt_status" | "btn_login" | ...`），供装饰器参数类型约束

#### Scenario: 生成 declaration merging interface

- **WHEN** 组件 displayList 含已命名元件
- **THEN** 生成产物包含与组件类同名的 interface，声明 `_` + 元件名字段及能力接口类型，与手写类声明合并后 `this._字段名` 获得类型

#### Scenario: 生成产物带禁止手改头

- **WHEN** 生成产物被写出
- **THEN** 文件首部含"由 gen-types 生成，禁止手改"的注释与包/组件信息

### Requirement: 生成产物确定性

类型生成器 SHALL 产生确定性输出：同一源 XML 多次运行生成内容一致，产物按资源 id / 元件顺序稳定排序，不依赖文件系统遍历顺序。

#### Scenario: 重复运行输出一致

- **WHEN** 同一工程连续两次运行 gen-types
- **THEN** 两次生成的产物文件内容完全一致

### Requirement: validate 校验产物与源 XML 一致

FGUI validate SHALL 校验 gen-types 产物与源 XML `displayList` 的一致性：组件名、字段名、能力 kind 与 XML 不符即失败，并指明差异。产物缺失或过期同样失败。

#### Scenario: 字段改名未重跑即失败

- **WHEN** 源 XML 中某元件改名或删除，而未重跑 gen-types
- **THEN** validate 报告生成产物与 XML 不一致并失败

#### Scenario: 产物与 XML 一致时通过

- **WHEN** gen-types 产物与所有组件 XML 的 displayList 完全一致
- **THEN** validate 对该部分校验通过

### Requirement: 产物被装饰器参数约束

生成产物中的节点名联合 SHALL 作为装饰器（如点击绑定）参数的类型约束，使传入不存在的节点名在编译期报错。

#### Scenario: 拼错节点名编译期拦截

- **WHEN** 装饰器参数传入不在生成节点名联合中的名字
- **THEN** TypeScript 编译报错，禁止该值通过类型检查

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
