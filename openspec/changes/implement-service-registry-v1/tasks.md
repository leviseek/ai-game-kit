## 1. 类型化 token 与注册表契约

- [x] 1.1 先编写失败测试，锁定 `ServiceToken<T>` 的类型绑定（泛型 token 解析类型与注册类型一致、类型不匹配编译期被拒）与 token 每次创建独立。（由本 change 完成：新增 `service-registry.typecheck.ts` 锁定 token 类型绑定/注册解析类型一致/`@ts-expect-error` 拒绝错配，并接入 `check-foundation-contracts.ts`；新增 `service-registry.test.ts` 覆盖 token 每次创建独立、description 诊断与对象身份唯一性。红色期确认：typecheck 与 test 均因 `core/services/ServiceRegistry` 不存在而失败。）
- [x] 1.2 实现 `core/services/ServiceRegistry.ts` 的 `ServiceToken`/`createServiceToken` 与 `ServiceRegistry` 契约，使 1.1 通过且不依赖 Cocos。（本 change 完成：`core/services/ServiceRegistry.ts` 定义 `ServiceToken<T>`（`description` + 编译期 brand 键）、`createServiceToken`、`ServiceRegistry` 契约（`register`/`registerFactory`/`resolve`/`isRegistered`），纯 TypeScript 不依赖 Cocos；1.1 测试转绿，完整 foundation 465 pass / 0 fail。）

## 2. 注册、解析与错误路径

- [x] 2.1 先编写注册/解析测试，覆盖实例注册、重复解析同一实例、注册状态查询、缺失 token 拒绝（携带 token 描述）与重复注册拒绝（不覆盖已有注册）。（由本 change 完成：`service-registry.test.ts` 新增注册/解析与错误路径用例——resolve 返回注册实例、重复 resolve 同一实例、isRegistered 查询、缺失 token 抛 `ServiceResolutionError` 且含描述、重复注册抛 `ServiceRegistrationError` 且保留首个注册、错误类携带 description。红色期确认：`createServiceRegistry`/错误类尚未实现，测试因导出缺失失败。）
- [x] 2.2 实现 `register`/`resolve`/`isRegistered` 与 `ServiceRegistrationError`/`ServiceResolutionError`（继承 `FrameworkError`），使 2.1 通过。（本 change 完成：`core/services/ServiceRegistry.ts` 实现以 token 对象身份为键的实例存储，`register` 重复注册抛 `ServiceRegistrationError`、`resolve` 缺失 token 抛 `ServiceResolutionError`（均携带 description 且继承 `FrameworkError`）、`isRegistered` 查询；`registerFactory` 尚未实现，提供明确拒绝占位。2.1 测试转绿，完整 foundation 471 pass / 0 fail，types EXIT 0。）
- [x] 2.3 先编写工厂注册与依赖循环测试，覆盖工厂解析依赖链成功、循环依赖拒绝（标识循环 token）与解析失败无残留状态。（由本 change 完成：`service-registry.test.ts` 新增工厂注册与循环检测用例——工厂经注入 resolve 解析依赖、工厂链式依赖、工厂直接解析、自引用循环拒绝、互依循环拒绝且错误含 token 名、解析失败无残留状态。红色期确认：`registerFactory` 尚未实现，6 个新用例失败。）
- [x] 2.4 实现 `registerFactory` 与解析期依赖循环检测（进行中解析集合），使 2.3 通过。（本 change 完成：`core/services/ServiceRegistry.ts` 以 `instance`/`factory` 判别联合存储注册条目，`registerFactory` 存入工厂；`resolve` 经递归 `resolveInternal` 求值工厂依赖，以进行中解析集合检测自引用/互依循环并抛 `ServiceResolutionError`，`finally` 清理进行中状态保证解析失败无残留；工厂不缓存、每次解析按当前工厂求值。2.3 测试转绿，完整 foundation 477 pass / 0 fail，types EXIT 0。）

## 3. ApplicationContext/Module 边界与公开导出收口

- [x] 3.1 在 `contracts.typecheck.ts` 增补断言：引入服务注册表后 `ApplicationContext` 仍无 `get/resolve/registry/container/provide`，`Module` 仍无 `register/create/configure`，锁定独立接入边界。（本 change 完成：所需断言已存在——`_ApplicationContextHasNoServiceLocator`（`NeverKey` 锁定 `get|resolve|registry|container|provide`）与 `_ModuleHasNoManagerPattern`（`NeverKey` 锁定 `create|register|configure|manager|builder`，为任务要求的超集），均经顶层 `type _X = Expect<...>` 强制求值；`check-foundation-contracts.ts` 的 `typeCheckEntries` 已接入 `contracts.typecheck.ts`。引入 service-registry 后 `bun run test:foundation:types` EXIT=0，边界门禁验证有效，无需新增断言代码。）
- [x] 3.2 在 `assets/framework/index.ts` 导出稳定符号（`ServiceToken`、`ServiceRegistry`、两个错误类、`createServiceToken`、`createServiceRegistry`），并同步 `tests/framework/foundation/public-boundary.test.ts` 的 `expectedRootExports` 白名单。（本 change 完成：`assets/framework/index.ts` 新增 `ServiceRegistry`/`ServiceToken` 类型导出与 `ServiceRegistrationError`/`ServiceResolutionError`/`createServiceRegistry`/`createServiceToken` 值导出；`public-boundary.test.ts` 的 `expectedRootExports` 白名单同步新增 6 个符号。验证：`bun test public-boundary.test.ts` 26 pass / 0 fail，`bun run test:foundation:types` EXIT=0。）
- [x] 3.3 先编写组合根接入测试：注册表由组合根显式创建与注入，业务对象经构造接收服务契约，不直接依赖注册表或 `ApplicationContext`。（本 change 完成：新增 `service-registry-composition.test.ts` 锁定组合根接入边界——`assembleApp` 暴露组合根创建的注册表（register/registerFactory/resolve/isRegistered 可用）、每次 `assembleApp` 独立创建注册表非全局单例、业务对象 `GreetingController` 仅经构造接收已解析服务契约且不接触注册表/Context。红色期确认：`assembleApp` 当前不返回 `registry`，3 个新用例均因 `registry` undefined 失败，GREEN 由 4.1 在 `boot/AppRoot.ts` 接入后实现。）

## 4. 组合根接入与装配前校验

- [ ] 4.1 在 `boot/AppRoot.ts` 的 `assembleApp` 接入最小服务注册/解析演示与装配前 token 校验（模块依赖缺失/循环在 `Application.start` 前抛错），使 3.3 通过；`createModules` 不依赖注册表，`startup.scene` 不修改。
- [ ] 4.2 补充验证：装配前校验失败走既有 `app.start().catch` 失败路径，不进入 `running`，回滚按现有规则执行。

## 5. 集成验证与收口

- [ ] 5.1 运行完整 `bun run test:foundation`，记录原有 Foundation 测试与新增 service-registry 测试通过数量与零失败结果。
- [ ] 5.2 运行 `bun run test:foundation:types` 与项目可用的 Framework 类型检查、`git diff --check`，确认无类型绕过、无宽松类型规则。
- [ ] 5.3 审查公开 API 与依赖边界，确认只导出稳定契约/工厂，`ApplicationContext`、`Module`、`Application` 与 `startup.scene` 行为不变。
- [ ] 5.4 将父级 `create-game-framework-v1/tasks.md` 的任务 2.8 标记完成并附实现证据；执行 ADR 检查，确认本 change 是否产生新的架构决策并按要求创建 ADR 或明确记录无需 ADR。
