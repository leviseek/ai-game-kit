## Purpose

为 Framework 提供引擎无关的资源所有权与加载协调边界，使业务通过统一入口加载和释放 Bundle 与资源，支持并发去重、失败传播、作用域逆序释放和 Bundle 可卸载判断，避免直接操作 Cocos Asset 造成泄漏或过早释放。

## ADDED Requirements

### Requirement: Resource handles abstract engine assets

资源系统 MUST 以引擎无关的资源 handle 表达资源加载请求。handle MUST 携带资源标识、归属 Bundle 与加载状态，并 MUST 在加载完成后向使用方提供底层资源。使用方 MUST NOT 依赖具体引擎 Asset 类型完成跨模块协作；handle 的创建 MUST 只经由框架提供的加载入口。

#### Scenario: Caller loads asset through a handle
- **WHEN** 调用方通过框架加载入口请求一个资源
- **THEN** 调用方获得该资源的 handle，且 handle 可标识加载状态并在成功后提供底层资源

#### Scenario: Caller does not touch engine asset API directly
- **WHEN** 调用方需要获取资源内容
- **THEN** 调用方通过 handle 或统一加载入口取得结果，而不直接操作引擎全局资源 API

### Requirement: Loading is coordinated and deduplicated

同一资源在同一时刻的并发加载请求 MUST 共享一次底层加载。第一个请求失败 MUST 传播给所有等待该资源的调用方；等待者的取消 MUST 不影响其他等待者继续收到加载结果。不同作用域引用同一底层资源时 MUST 共享同一加载结果。

#### Scenario: Concurrent requests share one load
- **WHEN** 两个调用方几乎同时请求加载同一个尚未加载的资源
- **THEN** 底层资源只被加载一次，两个调用方都收到同一个加载结果

#### Scenario: Load failure propagates to all waiters
- **WHEN** 一个底层加载失败，且存在多个等待该资源的调用方
- **THEN** 所有等待该资源的调用方都收到该失败，且失败信息保留原始错误原因与资源标识

#### Scenario: Cancelled waiter does not break other waiters
- **WHEN** 一个等待者所属作用域释放或调用方显式取消其对某资源的等待，而其他等待者仍等待同一资源
- **THEN** 取消只作用于该等待者，其他等待者仍按原规则收到加载结果

#### Scenario: Different scopes share the same underlying asset
- **WHEN** 两个不同作用域引用同一底层资源
- **THEN** 两个作用域共享同一个底层加载结果，而不是各自触发一次独立加载

### Requirement: Resource scopes release in reverse order with ownership

资源使用 MUST 通过作用域表达所有权。页面/场景/应用等作用域 MUST 支持逆序释放；释放一个作用域 MUST 只影响该作用域持有的资源。仍被其他作用域或使用方引用的资源 MUST 保留。框架 MUST 在全部相关所有者释放后才允许卸载底层 Bundle。

#### Scenario: Scope release does not evict still-referenced assets
- **WHEN** 一个作用域释放，但底层资源仍被另一作用域引用
- **THEN** 该底层资源保留，不触发卸载

#### Scenario: Bundle unloads only when no owners remain
- **WHEN** 一个 Bundle 的所有相关作用域都已释放且无其他引用
- **THEN** 该 Bundle 标记为可卸载并执行卸载，卸载判断不依赖引擎全局状态

#### Scenario: Reverse-order release across independent scopes
- **WHEN** 页面、场景与应用是相互独立、无父子关系的作用域，各自持有资源，且调用方按从内到外顺序释放
- **THEN** 每个作用域按逆序释放其自身持有项，且内部作用域释放不会提前释放外层作用域仍持有的资源

### Requirement: Resource access goes through one provider boundary

所有业务资源访问 MUST 通过统一资源提供契约完成。框架 MUST 提供该契约的 Cocos Asset Bundle 适配器；业务代码 MUST NOT 直接调用引擎 Bundle 加载或释放 API。适配器 MUST 在失败时保留底层错误 cause 与资源标识。

#### Scenario: Business code loads through the provider only
- **WHEN** 业务代码需要加载或释放资源
- **THEN** 业务代码使用统一资源提供契约，框架在内部完成与具体引擎 Bundle 的交互

#### Scenario: Adapter preserves error cause and identity
- **WHEN** 底层 Bundle 加载或资源加载失败
- **THEN** 使用方收到的失败保留原始错误原因和可辨识的资源标识，用于诊断定位

### Requirement: Bundle layout keeps startup resources minimal

`resources` MUST 只保留启动所需的最小配置或诊断资源；通用资源、UI、音频与游戏内容 MUST 通过独立 Bundle 组织。框架 MUST 提供判断某 Bundle 是否可卸载的查询能力，且不要求业务手工管理 Bundle 的加载状态清单。

#### Scenario: Non-startup content lives in separate bundles
- **WHEN** 项目按规划划分 `common`、`ui`、`audio` 与游戏内容 Bundle
- **THEN** `resources` 只包含启动所需资源，其余内容通过对应 Bundle 加载

#### Scenario: Unload query reflects current ownership
- **WHEN** 调用方查询某个 Bundle 的可卸载状态
- **THEN** 查询结果反映该 Bundle 当前是否仍有相关作用域或引用持有
