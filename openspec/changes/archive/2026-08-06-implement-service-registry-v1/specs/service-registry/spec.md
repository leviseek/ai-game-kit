## Purpose

为 Framework 提供小型类型化服务注册表：组合根以类型化 token 注册服务、按 token 解析声明依赖，并在应用进入 `running` 前拒绝重复注册、缺失 token 与解析期依赖循环，从而在不把 `ApplicationContext` 退化为全局 Service Locator 的前提下支持适配器替换与测试替身注入。

## ADDED Requirements

### Requirement: Service tokens are typed and unique per service

框架 MUST 提供类型化 token 机制，使每个 token 绑定唯一服务类型，且同一名称不得重复创建出语义相同的 token。解析服务时 MUST 按 token 的静态类型返回对应实例，调用方不得通过字符串任意查询服务。

#### Scenario: Token binds service type
- **WHEN** 调用方为 `AudioService` 类型创建 token 并以此 token 解析服务
- **THEN** 解析结果静态类型为 `AudioService`，类型不匹配在编译期被拒绝

### Requirement: Services register and resolve by token

注册表 MUST 支持以类型化 token 注册服务实例或服务工厂，并支持按 token 解析、查询是否已注册；解析已注册 token MUST 返回该 token 注册的服务，重复解析 MUST 返回同一实例或由注册策略明确表达的等价结果。服务生命周期 MUST 由显式所有者控制，注册表不得自动创建或接管未注册对象。

#### Scenario: Registered instance resolves by token
- **WHEN** 调用方注册某个 token 对应的服务实例后解析该 token
- **THEN** 解析返回该实例，且后续再次解析仍返回同一实例

#### Scenario: Registration state is queryable
- **WHEN** 调用方查询一个已注册 token 与一个未注册 token 的注册状态
- **THEN** 已注册 token 查询为已注册，未注册 token 查询为未注册

### Requirement: Duplicate registration and missing token fail with typed errors

同一 token 重复注册 MUST 以类型化错误失败，且不覆盖已有注册；解析未注册 token MUST 以类型化错误失败。上述错误 MUST 携带 token 标识等可诊断上下文，用于区分编程错误与配置缺失。

#### Scenario: Duplicate registration is rejected
- **WHEN** 调用方对同一 token 注册第二个服务
- **THEN** 注册失败并抛出类型化错误，且注册表仍保留首个注册的服务

#### Scenario: Missing token resolution is rejected
- **WHEN** 调用方解析一个从未注册的 token
- **THEN** 解析失败并抛出携带 token 标识的类型化错误

### Requirement: Factory resolution detects dependency cycles before running

支持工厂形式的注册时，解析阶段 MUST 检测正在解析链中重复解析同一 token 所构成的依赖循环，并 MUST 以类型化错误失败。组合根在应用进入 `running` 前 MUST 完成注册与解析校验，使缺失 token、重复注册与依赖循环在运行期前暴露，且非法装配不得进入 `running` 状态。

#### Scenario: Cyclic factory resolution fails
- **WHEN** 两个 token 的工厂互相依赖对方并在解析时构成循环
- **THEN** 解析失败并抛出指示循环依赖的类型化错误，不产生部分构造结果

#### Scenario: Assembly validation precedes running
- **WHEN** 组合根以包含缺失 token 或依赖循环的装配发起应用启动
- **THEN** 应用在进入 `running` 前停止启动并报告类型化错误，已初始化模块按既有回滚规则释放

### Requirement: Registry is decoupled from ApplicationContext and not a global service locator

服务注册表 MUST 独立于 `ApplicationContext` 存在，`ApplicationContext` 不得获得服务解析或 `get<T>()` 能力，业务代码 MUST NOT 依赖全局注册表实例或通过 Context 查询服务。服务依赖 MUST 由组合根在装配阶段显式注入到模块或业务对象，注册表只存在于组合根与模块装配边界。

#### Scenario: ApplicationContext stays minimal
- **WHEN** 引入服务注册表后检查 `ApplicationContext` 契约
- **THEN** `ApplicationContext` 仍只暴露 Logger 与只读生命周期状态，不包含 token、服务解析或注册表成员

#### Scenario: Business code receives services explicitly
- **WHEN** 业务对象需要使用某个服务
- **THEN** 该服务由组合根在创建对象时显式传入，业务对象不直接访问注册表或 `ApplicationContext`

### Requirement: Public exports keep stable contracts only

公开入口 MUST 只导出服务注册表的稳定契约、类型化 token 创建函数与必要的工厂，MUST NOT 导出内部存储结构或错误记录实现细节。

#### Scenario: Root entry exports service registry contracts
- **WHEN** 外部模块从框架根入口导入服务注册能力
- **THEN** 可导入 token 类型、注册表契约与必要工厂，且不暴露内部实现
