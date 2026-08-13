## Purpose

为 FUI 静态页绑定链建立运行时边界契约：组件 URL 消费生成常量，组件显式声明是否必需实例级运行时绑定，绑定在事务式作用域内装配并在失败时完整回滚，端口只注入 Application facade。

## ADDED Requirements

### Requirement: FUIBind 消费生成 URL 常量

`@FUIBind` SHALL 以 `FuiComponentUrl`（`ui://<包>/<组件>` 模板字面量类型）作为组件标识，参数直接消费 `ui/generated` 的生成 URL 常量，禁止裸字符串或手动拼接。同一 URL 重复登记 SHALL 视为错误。

#### Scenario: 生成常量作为绑定参数

- **WHEN** 组件类以 `@FUIBind(UiDemoCloseDialog, fields, options)` 修饰，其中 `UiDemoCloseDialog` 为 `ui/generated` 生成的 `FuiComponentUrl` 常量
- **THEN** 注册表以该 URL 为复合键登记组件类，创建路径可按该 URL 解析到类

#### Scenario: 非规范字符串被编译期拒绝

- **WHEN** `@FUIBind` 首参数传入非 `ui://<包>/<组件>` 形状的字符串
- **THEN** TypeScript 编译报错，禁止该值通过类型检查

### Requirement: 运行时绑定策略显式声明

`@FUIBind` SHALL 经必填 `options.runtimeBinding: "required" | "none"` 显式声明组件是否需要运行时绑定；未提供该选项的注册 SHALL 在编译期被拒绝。声明 `required` 的组件在创建时缺少对应运行时 binder SHALL 创建失败。

#### Scenario: 显式声明 required 绑定

- **WHEN** 组件以 `{ runtimeBinding: "required" }` 修饰且对应 binder 已注册
- **THEN** 创建成功，binder 以该组件实例为参数执行运行时装配

#### Scenario: 显式声明无需绑定

- **WHEN** 组件以 `{ runtimeBinding: "none" }` 修饰
- **THEN** 创建无需执行任何 binder

#### Scenario: 缺少 required binder 创建失败

- **WHEN** 组件声明 `runtimeBinding: "required"` 但创建时对应 binder 未注册
- **THEN** 创建失败，报告 runtime binding missing

### Requirement: 创建失败回滚已获取资源

创建 required 组件失败（缺 binder、ctor 抛错、binder 抛错）SHALL 回滚已创建的 View、已注册点击监听与 GComponent；回滚 SHALL 尝试每一个步骤，全部失败在结束时聚合报告。失败后页面 SHALL 处于已销毁状态。

#### Scenario: 缺失 required binder 时回滚

- **WHEN** required 组件因缺 binder 创建失败
- **THEN** 已创建的 View、点击监听与 GComponent 全部被清理，页面标记为 disposed，错误指出缺失绑定

#### Scenario: binder 抛错后回滚已登记句柄

- **WHEN** binder 建立首个句柄后抛错
- **THEN** 错误向上传播，Host 逆序释放已登记句柄、View 与 GComponent，每个底层句柄至多释放一次

### Requirement: 事务式绑定作用域

运行时 binder SHALL 接收实例级 `FuiViewBindingScope`，每获得一个句柄 SHALL 立即 `scope.own(handle)` 登记；scope 仅登记句柄不负责回滚，回滚所有权归调用方（Host）。binder 成功后 scope SHALL 作为单一句柄转交 View 清理所有权。

#### Scenario: 句柄获得即登记

- **WHEN** binder 依次获得多个句柄
- **THEN** 每个句柄在获得的当下即被登记进 scope，之后获得句柄失败不影响已登记句柄

#### Scenario: 成功转交与失败保留

- **WHEN** binder 全部成功
- **THEN** scope 整体转交 View 作为单一清理句柄；当 binder 中途失败时已登记句柄仍留在 scope 中，由 Host 逆序清理

### Requirement: 端口只注入 Application facade

页面实例的运行时依赖 SHALL 仅包含 Store 与 Application facade（Use Case 端口）；网络、存储、资源端口与匿名业务回调 SHALL NOT 进入 View 依赖类型。端口实现 SHALL 在 Feature assembly 组装并经 binder 注入。

#### Scenario: View 只接收 Store 与 facade

- **WHEN** Feature assembly 注册 CloseDialog 的 binder
- **THEN** View 收到的依赖仅为 Store 与 `CloseDialogApplication`，两者均由 binder 注入

#### Scenario: 端口与回调不进入 View

- **WHEN** 检查 View 的依赖类型
- **THEN** 依赖中不含网络、存储、资源端口或匿名业务回调
