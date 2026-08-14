## Purpose

为资源所有权模型补充包级释放边界：FGUI package 引用归零即从引擎注册表移除（即使其所在 Bundle 仍被其它包持有），并保证移除后同 key 可重新加载，解决共享 bundle 场景下会话级包永驻内存的问题。

## ADDED Requirements

### Requirement: 包级卸载接缝（FGUI package 引用归零即移除）

资源提供器 SHALL 提供可选包级卸载执行器（`unloadPackage(bundle, path)`）：FGUI package 键的引用计数归零时 SHALL 触发该执行器，即使其所在 Bundle 仍被其它包（如常驻通用包）持有；执行器失败 SHALL 被隔离，不阻断 bundle 级卸载判定。未提供该执行器时 SHALL 保持既有行为（包随整 bundle 卸载路径清理）。

#### Scenario: 共享 bundle 下会话包释放即移除

- **WHEN** 会话作用域持有 `ui` bundle 内的会话包（如 AutoBattle），全局作用域持有同 bundle 的常驻包（如 Common），且会话作用域释放
- **THEN** 会话包从引擎注册表移除（`UIPackage.removePackage`），而 bundle 因常驻包仍被持有不触发整 bundle 卸载

#### Scenario: 常驻包不受影响

- **WHEN** 常驻包（如 Common）被全局作用域永久持有且从未释放
- **THEN** 常驻包不从注册表移除，跨会话保持可用

#### Scenario: 包级卸载执行器失败被隔离

- **WHEN** 包级卸载执行器抛错而 bundle 同时已无持有
- **THEN** 错误被隔离上报，整 bundle 卸载判定与执行不被阻断

### Requirement: 包级移除后同 key 可重新加载

包级卸载执行器触发后，协调器对同资源键（bundle + path，kind 为 `fairygui-package`）的终态缓存 SHALL 失效，使下次 `loadPackage` 重新执行底层加载并重新登记引擎注册表；加载中的条目 SHALL NOT 被驱逐（不破坏并发共享语义）。

#### Scenario: 移除后重载重新登记

- **WHEN** 会话包被包级移除后，同一会话或后续会话再次 `loadPackage` 同一路径
- **THEN** 加载重新触发，引擎注册表重新登记该包，页面创建成功而非拿到已移除包的陈旧结果
