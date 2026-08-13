## 1. 验证基线与目录边界

- [x] 1.1 记录 Bun、Node 和可用测试运行器现状，确认 Bun 可直接执行 TypeScript 且无需新增依赖；建立可重复执行的 Bun foundation 测试命令，并用最小失败测试证明门禁生效。
    - 基线：Bun 1.3.13、Node.js v24.15.0；项目未安装 Vitest、Jest、tsx、ts-node 或独立 tsc，使用 `bun:test` 无需新增依赖或 lockfile。
    - 命令：完整 foundation 门禁为 `bun run test:foundation && bun run test:foundation:types`。`test:foundation` 仅扫描仓库级 `tests/framework/foundation` 的运行时单元测试，不进入 Cocos `assets` 导入范围；`test:foundation:types` 定位 Creator 3.8.8 内置 tsc，对全部 `assets/framework` 源码与 `tests/framework/foundation/contracts.typecheck.ts` 契约断言执行 `--strict --noEmit` 检查。
    - 门禁证据：受控失败断言得到 0 pass / 1 fail 与退出码 1；修正后得到 1 pass / 0 fail 与退出码 0。
    - REVIEW（Phase Review 补强，2026-08-04）：此前 `module-contract.test.ts` 中的契约类型断言被 Bun 转译擦除、从未进入 TypeScript checker；新增 `test:foundation:types` 门禁使契约断言与全部 Framework 源码真正执行 strict 类型检查。根入口白名单门禁同时补强到 `public-boundary.test.ts`，锁定精确导出集合并拒绝 `export *` 与内部实现泄露。两个门禁均已通过突变测试证明能捕获违规。
- [x] 1.2 按 design.md 建立 `core`、`contracts`、`application`、`diagnostics/logging` 和 `adapters/cocos/application` 目录，不创建 UI、resource、scene、ECS 或 game 业务目录。
    - 已建立 `core/errors`、`core/lifecycle`、`contracts/application`、`contracts/module`、`contracts/logging`、`application`、`diagnostics/logging` 和 `adapters/cocos/application`；空目录不加入 `.gitkeep` 等占位文件。
- [x] 1.3 建立 `assets/framework/index.ts` 的最小公开入口和导入边界测试，先证明跨模块深层导入会被检查发现。
    - RED：边界检测用例能识别合成的 Framework 深层导入，根入口缺失断言失败；GREEN：新增根入口后边界测试 3 pass / 0 fail，未暴露任何尚未实现的契约。
- [x] 1.4 补强 Foundation 架构测试：扫描 `assets` 下除 Framework 外的全部 TypeScript 消费者，并为 `core -> contracts -> application -> adapters/cocos` 建立内部 import allowlist；覆盖合法根导入、非法深层导入、core 禁止依赖 `cc`、contracts 禁止依赖实现、application/Framework 禁止依赖 Game，且不引入第三方依赖分析库。
    - RED：新增 `contracts/module -> application/ApplicationContext` 反向依赖断言后，旧门禁返回空违规集合并以 1 fail 证明缺口。
    - GREEN：使用 Bun 内置 TypeScript import scanner 与仓库内补充分析覆盖 static/type/dynamic import、require、import-equals、相对路径、`db://assets` 和 `@framework`/`@game` alias；边界测试 8 pass / 0 fail，未新增依赖。
- [x] 1.5 通过 Cocos Creator 导入新增 assets 文件并生成 `.meta`，检查没有手工复制 UUID、没有改动 `library`、`temp` 或 `profiles`。
    - Creator 3.8.8 资源数据库已记录全部 14 个 Framework `.meta` 及对应 `db://assets/framework/**` URL；14 个 UUID 全部唯一，全 assets 共 19 个 UUID 无重复，asset DB 没有 missing 记录。
    - `library/.assets-info.json`、`library/.assets-data.json` 和 editor/preview packer record 均包含 `framework/index.ts` UUID；`library`、`temp`、`profiles` 没有 tracked 文件或 Git diff。
- [x] 1.6 运行当前项目类型检查并记录既有 `strict: false` 基线；新增实现不得使用 `as any`、`@ts-ignore` 或删除有效检查。
    - 使用 Creator 3.8.8 内置 TypeScript 5.8.2；有效项目配置为 `strict: false`、target/module `ES2015`、`noEmit: true`。隔离 Cocos 声明文件后对 `assets/**/*.ts` 执行检查，当前只包含 `assets/framework/index.ts`，结果 0 diagnostics。
    - 完整仓库直接执行 `tsc --project tsconfig.json` 的既有基线非绿色：仓库级 Bun 测试缺少 Node/Bun 类型且不兼容 Cocos ES2015 module/target，Creator 引擎声明也存在 standalone tsc diagnostics；本切片不通过新增依赖、修改 tsconfig 或跳过源码检查掩盖这些工具链边界，Framework asset 源码当前无错误且未使用 `as any`、`@ts-ignore`。

## 2. Logger 基础能力

- [x] 2.1 先编写 Logger 契约测试，覆盖 debug/info/warn/error、timestamp、scope、message、浅层结构化 context 和可选 error。
    - RED：新增 Logger contract 测试后得到 4 pass / 1 fail，唯一失败为 `contracts/logging/Logger.ts` 尚不存在；测试同时定义 child scope/context 继承、父 Logger 不可变和 Error cause 保留约束。
- [x] 2.2 在 `contracts/logging` 定义最小 Logger 公共类型与 child logger 行为，通过根入口只导出稳定 contract，使 2.1 的测试通过且不依赖 Cocos、Application 或具体实现。
    - GREEN：新增 Logger、LogLevel、LogRecord、LogContext 最小契约，并通过根入口 type-only 导出；Logger 目标测试 5 pass / 0 fail，完整 Foundation 测试 14 pass / 0 fail，Creator TypeScript strict 检查 0 diagnostics。
- [x] 2.3 先编写 child logger 测试，覆盖父子 scope、上下文合并、调用级字段覆盖和父 Logger 不可变。
    - RED：新增 child logger 行为测试，固定父子 scope 点号组合、父级 < child < 调用级的浅层 context 覆盖顺序和父 Logger 不可变；目标测试 0 pass / 3 fail，完整 Foundation 测试 14 pass / 3 fail，失败均为 `diagnostics/logging/ScopedLogger.ts` 尚未实现。
- [x] 2.4 实现 Logger 上下文派生，使 2.3 的测试通过且不使用全局静态 Logger。
    - GREEN：新增内部 `createScopedLogger`，通过共享 record sink 和不可变 scope/context 快照实现点号 scope 派生及父级 < child < 调用级浅层合并；child 目标测试 3 pass / 0 fail，完整 Foundation 测试 17 pass / 0 fail，Creator TypeScript strict 检查 0 diagnostics，未引入全局静态 Logger。
- [x] 2.5 在 `diagnostics/logging` 实现直接输出结构化记录的 ConsoleLogger，并在仓库级测试支持目录提供不参与 Cocos 构建的 MemoryLogger；验证可以按 level、scope 和浅层 context 断言，不得加入递归序列化、循环检测或敏感字段脱敏。
    - RED：新增输出行为测试后得到 0 pass / 2 fail，分别证明 ConsoleLogger 和仓库级 MemoryLogger 尚不存在。
    - GREEN：ConsoleLogger 按 level 把完整 LogRecord 直接交给对应 console 方法，MemoryLogger 通过只读 records 支持 level/scope/context 断言；目标测试 2 pass / 0 fail，完整 Foundation 测试 19 pass / 0 fail，Creator TypeScript strict 检查 0 diagnostics，未加入递归序列化、循环检测或敏感字段脱敏。

## 3. ApplicationContext、Module 契约与依赖图

- [x] 3.1 先编写 ApplicationContext 与 Module 契约类型测试：Context contract 只包含 Logger、ApplicationState 与只读生命周期查询；Module 覆盖稳定 id、只读 dependencies、完整同步/异步钩子，并只能通过 type-only import 依赖 `contracts/application`，禁止依赖 ApplicationContext 实现或 Cocos Component 基类。
    - RED：Module 契约目标测试得到 5 pass / 1 fail，唯一失败为 `contracts/module/Module.ts` 尚不存在；测试同时覆盖稳定只读 id、依赖 id 列表、可选同步/异步生命周期钩子、组合式接口和 ApplicationContext type-only import，并补充 `contracts/module` 专项架构扫描。
- [x] 3.2 在 `contracts/application` 定义 ApplicationContext interface、ApplicationState 和只读生命周期查询契约，在 `contracts/module` 定义 Module、ModulePhase 和 ModuleRuntimeState，并在 `application` 定义 ModuleLifecycleError，使 3.1 通过；contracts 不得导入 `application`、diagnostics 或 adapters，且 `contracts/module` 不得产生运行时代码。
    - GREEN：新增 ApplicationContext/ApplicationLifecycle/ApplicationState、Module/ModulePhase/ModuleRuntimeState，并把保留 module id、phase 和 cause 的 ModuleLifecycleError 归属 `application` 运行时编排层；`contracts/module` 的 TypeScript 输出可完全擦除，ModuleLifecycleError 通过根入口导出；目标契约与架构测试通过，Creator TypeScript strict 检查和 meta UUID 保留检查均通过。
- [x] 3.3 先编写 ModuleGraph 测试，覆盖空模块集合、单模块、依赖链、分支依赖和独立模块注册顺序稳定性。
    - RED：新增 ModuleGraph 稳定拓扑顺序测试，定义内部 `new ModuleGraph(modules).orderedModules` API；目标测试 0 pass / 5 fail，完整 Foundation 测试 27 pass / 5 fail，五项失败均为 `application/ModuleGraph.ts` 尚未实现，未提前创建生产代码。
- [x] 3.4 先编写 ModuleGraph 失败测试，覆盖空 id、重复 id、缺失依赖、自循环和多节点循环。
    - RED：新增 ModuleGraph 构造校验测试，覆盖空 id、重复 id、缺失依赖、自循环和多节点循环，且不锁定错误文案；目标测试 0 pass / 5 fail，完整 Foundation 测试 27 pass / 10 fail，其中新增五项失败均为 `application/ModuleGraph.ts` 尚未实现，未提前创建生产代码。
- [x] 3.5 实现一次性 ModuleGraph 校验与稳定拓扑排序，使 3.3、3.4 的测试通过，并保证校验失败前没有执行任何模块钩子。
    - GREEN：新增内部 `ModuleGraph`，在构造阶段完成空 id、重复 id、缺失依赖和循环依赖校验，并按注册顺序执行稳定拓扑排序；校验失败不会调用任何模块生命周期钩子。ModuleGraph 目标测试 11 pass / 0 fail，完整 Foundation 测试 39 pass / 0 fail，Creator TypeScript strict 检查通过，新增脚本 `.meta` 由 Cocos Creator 3.8.8 自动生成，且未从 Framework 根入口导出。

## 4. ModuleRunner 初始化与回滚

- [x] 4.1 先编写 ModuleRunner 主路径测试，重点覆盖正序 initialize/start 和逆序 stop/dispose。
    - RED：新增 ModuleRunner 主路径测试，定义内部 `new ModuleRunner(orderedModules, context)`、四阶段方法和 `getState(moduleId)` API；目标测试 0 pass / 3 fail，完整 Foundation 测试 40 pass / 3 fail，失败均为 `application/ModuleRunner.ts` 尚未实现，并覆盖重复阶段调用不得重复执行钩子。
- [x] 4.2 实现 ModuleRunner 的阶段状态记录和主路径生命周期调用，使 4.1 的测试通过并阻止 initialize/start/stop/dispose 重复执行。
    - GREEN：新增内部 `ModuleRunner`，按传入的已排序模块正序 initialize/start、逆序 stop/dispose，并以 `ModuleRuntimeState` 阻止四阶段重复执行；目标测试 3 pass / 0 fail，完整 Foundation 测试 43 pass / 0 fail，Creator TypeScript 5.8.2 strict 检查与 `git diff --check` 通过，`.meta` 由 Creator 3.8.8 AssetDB 生成，且未从 Framework 根入口导出。
    - REVIEW：2026-08-02 用户审查通过；4.1、4.2 保持完成，未开始 4.3。
- [x] 4.3 先编写 initialize 失败测试，验证只逆序 dispose 已初始化模块，未初始化模块不执行清理。
    - RED：新增 initialize 失败回滚测试，验证失败前已初始化模块按逆序 dispose，失败模块与尚未初始化模块不清理且后续模块不再 initialize；目标测试 0 pass / 1 fail，完整 Foundation 测试 43 pass / 1 fail，失败精确指向 ModuleRunner 尚未执行 initialize 回滚。
    - REVIEW：2026-08-02 用户审查通过；4.3 标记完成，未开始 4.4。
- [x] 4.4 先编写 start 失败测试，验证逆序 stop 已启动模块，再逆序 dispose 已初始化模块。
    - RED：新增 start 失败分阶段回滚测试，验证先逆序 stop 已启动模块，再逆序 dispose 全部已初始化模块；目标测试 0 pass / 1 fail，完整 Foundation 测试 43 pass / 2 fail，其中新增失败精确指向 ModuleRunner 尚未执行 start 回滚，另一失败为已接受的 4.3 RED。
    - REVIEW：2026-08-02 用户审查通过；4.4 标记完成，未开始 4.5。
- [x] 4.5 在 initialize/start/stop/dispose 测试通过后，补充低优先级 pause/resume 冒烟测试，只覆盖 pause 逆序、resume 正序和省略钩子的兼容性；失败组合延后。
    - RED/GREEN：新增 pause 逆序、resume 正序和省略钩子兼容性测试；RED 为 0 pass / 3 fail，失败均因 pause/resume 尚不存在，最小实现后目标测试 3 pass / 0 fail，ModuleRunner 主路径与 pause/resume 合计 6 pass / 0 fail。完整 Foundation 测试 46 pass / 2 fail，仅保留已接受的 4.3、4.4 RED；Creator TypeScript 5.8.2 strict 检查与 `git diff --check` 通过，失败组合未实现。
    - REVIEW：2026-08-02 用户审查通过；4.5 标记完成，未开始 4.6。
- [x] 4.6 先编写清理失败测试，验证单个 stop/dispose 错误不会阻断剩余模块清理，且原始失败不会被回滚错误覆盖。
    - RED：新增 4 个清理失败测试，覆盖 stop/dispose 单点失败后继续剩余清理，以及 initialize/start 原始失败不被回滚错误覆盖；目标测试 0 pass / 4 fail，完整 Foundation 测试 46 pass / 6 fail，其中新增 4 个失败精确指向清理中断与回滚尚未实现，另 2 个为已接受的 4.3、4.4 RED。
    - REVIEW：2026-08-02 用户审查通过；4.6 标记完成，未开始 4.7。
- [x] 4.7 实现分阶段回滚、错误 cause 保留和清理错误聚合，使 initialize/start/stop/dispose 的失败测试通过，并保持 pause/resume 接口可调用。
    - GREEN：ModuleRunner 在 initialize 失败时逆序 dispose 已初始化模块，在 start 失败时先逆序 stop 已启动模块、再逆序 dispose 已初始化模块；stop/dispose 会继续执行剩余清理并通过只读错误数组聚合 ModuleLifecycleError，同时以 cause 保留首要失败。目标测试 9 pass / 0 fail，完整 Foundation 测试 52 pass / 0 fail，Creator TypeScript 5.8.2 strict 检查与 `git diff --check` 通过，pause/resume 冒烟测试保持绿色。
    - REVIEW：2026-08-02 用户审查通过；4.7 标记完成，未开始 4.8。
- [x] 4.8 使用 MemoryLogger 验证每个模块阶段日志都包含 module id、phase、level 和结果字段，不依赖 application identity。
    - RED/GREEN：新增 MemoryLogger 驱动的 ModuleRunner 日志测试；RED 为 0 pass / 2 fail，最小实现后目标测试 2 pass / 0 fail。initialize/start/pause/resume/stop/dispose 成功记录使用 info 与 `result: success`，失败记录使用 error 与 `result: failure` 并保留 ModuleLifecycleError cause；完整 Foundation 测试 54 pass / 0 fail，Creator TypeScript 5.8.2 strict 检查、架构边界与 `git diff --check` 通过，日志不包含 application identity。
    - REVIEW：2026-08-02 用户审查通过；4.8 标记完成，未开始 5.1。

## 5. Application 生命周期与 ApplicationContext

- [x] 5.1 先编写 Application 主状态测试，重点覆盖 `created -> initializing -> running -> stopping -> disposed`。
    - RED：新增 Application 生命周期测试（初始状态 created、全生命周期状态+调用顺序、空模块完整运行），目标测试 0 pass / 3 fail，失败统一指向根入口未导出 Application。
    - GREEN：5.3 实现 Application 后目标测试通过。后续补充 pause/resume 钩子状态验证（先钩子后 setState）、context 透传+不修改验证。完整 Foundation 测试 64 pass / 0 fail。
    - REVIEW：2026-08-04 用户审查通过；pause/resume 顺序修正、context passthrough 回归测试已到位。
- [x] 5.2 先编写启动失败测试，覆盖 ModuleGraph 校验失败、initialize 失败和 start 失败均进入 `stopping -> disposed`。
    - RED：新增启动失败测试（重复 id、缺失依赖、initialize 失败、start 失败），累计 7 项 Application 测试均 RED（根入口未导出）。
    - GREEN：5.3 实现 Application 后目标测试通过。后续补充错误 cause 链 traceability 验证（collectMessages），不绑定具体 Error class。完整 Foundation 测试 64 pass / 0 fail。
    - REVIEW：2026-08-04 用户审查通过；错误追溯验证保持 contract-level、不绑定 ModuleLifecycleError。
- [x] 5.3 实现 Application 的 start、dispose 和只读 state，使 5.1、5.2 的主路径与失败测试通过。
    - RED：5.1、5.2 共 7 项 Application 测试失败，根因为 Application 未实现/未导出。
    - GREEN：新增 `application/Application.ts`（经根入口导出），六状态生命周期 + start/pause/resume/dispose + 只读 state。失败路径 `initializing → stopping → disposed` 经局部 runner 清理后重抛原始错误。Application 只持有 ApplicationContext contract、不修改 context（design #7）。三次审查修正：移除 context cast → pause/resume 顺序改为先钩子后 setState → catch 清理用局部 runner（防 stale）。完整 Foundation 测试 64 pass / 0 fail，Creator TypeScript strict 检查与 `git diff --check` 通过。
    - REVIEW：2026-08-04 用户审查通过；5.3 标记完成，5.4 已完成。
- [x] 5.4 先编写 start/start、dispose/dispose、启动中 dispose 和 disposed/start 测试，覆盖主路径 single-flight 与非法终态操作。
    - RED：新增 Application 操作守卫测试（并发 start 单飞、running→start 拒绝、disposed→start 拒绝、启动中 dispose 串行化），累计 4 项 RED（5.3 无 guards/serialization 均不满足）。1 项 repeat dispose no-op 已 GREEN（5.3 finally 天然支持）。
    - 完整 Foundation 测试 65 pass / 4 fail；ApplicationStateError 契约由测试内 `isApplicationStateError` guard 定义（name + currentState），类实现属 5.5。
    - REVIEW：2026-08-04 用户审查通过；5.5 已完成。
- [x] 5.5 实现生命周期操作串行化和 single-flight，使 5.4 的测试通过且不依赖调用方加锁。
    - RED：5.4 的 4 项测试 RED（无串行化、无守卫、无单飞）。1 项 repeat dispose no-op 已 GREEN。
    - GREEN：新增 `ApplicationStateError` 并导出；`Application.ts` 加入 enqueue 串行队列、inFlightStart/Dispose 单飞锁（带引用校验防 stale）、状态前置守卫（start 仅 created、pause 仅 running、resume 仅 paused）、no-op（已 paused/disposed/running）。start 失败回滚经独立的 stop→dispose 清理（各自容错，不阻断对方）；dispose 统一走 try/catch 收集 cleanup 错误并通过 `context.logger.error` 上报后抛首错（调用方可感知）。`.finally` → `.then`（ES2015 兼容）。完整 Foundation 测试 69 pass / 0 fail，Creator TypeScript strict 检查与 `git diff --check` 通过。
    - REVIEW：2026-08-04 用户审查通过；5.6 已完成。
- [x] 5.6 在主路径稳定后实现 pause/resume，并补充 `running -> paused -> running`、重复 pause/resume 和省略 Module 钩子的低优先级冒烟测试；详细失败与并发矩阵延后。
    - RED：pause/resume 已在 5.3 实现（5.1 测试要求），本任务仅补充冒烟测试。新增测试均 GREEN（全覆盖 pause/resume 状态转换、no-op、非法状态抛 ApplicationStateError、省略钩子兼容、逆序/正序调用顺序）。完整 Foundation 测试 78 pass / 0 fail。
    - REVIEW：2026-08-04 用户审查通过；5.7 已完成。
- [x] 5.7 先编写 ApplicationContext implementation 边界测试，确认它实现 `contracts/application` 的公开 contract，只包含 logger 和 readonly lifecycle state，不包含 application identity、`get<T>()`、服务注册表、Application 实例或 Game 对象。
    - RED：新增 ApplicationContext 实现边界测试（创建 API、契约合规、service locator 禁入、identity 禁入、state getter 无 setter、module id child logger、根入口不泄露），9 项均 RED（`application/ApplicationContext.ts` 尚未创建）。完整 Foundation 测试 78 pass / 9 fail。
    - REVIEW：2026-08-04 用户审查通过；5.8 已完成。
- [x] 5.8 在 `application` 实现 ApplicationContext 的内部实现和供 Composition Root 调用的创建 API，并为每个模块提供以 module id 为 scope 的 child logger；不得从根入口导出可变实现，使 5.7 和模块日志测试通过。
    - RED：5.7 的 9 项测试 RED（`application/ApplicationContext.ts` 未创建）。
    - GREEN：新增 `application/ApplicationContext.ts`，导出 `createApplicationContext(logger)` 返回 `InternalApplicationContext`（logger + getter state + 内部 _setState）。child logger 经 `context.logger.child(moduleId)` 获得独立 scope。未导出至根入口。完整 Foundation 测试 87 pass / 0 fail，Creator TypeScript strict 检查与 `git diff --check` 通过。
    - REVIEW：2026-08-04 用户审查通过；5.9 已完成。
- [x] 5.9 验证空 Module 数组可以完整 start/dispose，并附带一次基础 pause/resume 冒烟，作为 AppRoot 默认启动基线。
    - GREEN：新增空模块基线测试（完整 start→pause→resume→dispose、非 created 拒绝、created 直接 dispose），全部 GREEN。同时既有 lifecycle 测试已覆盖相同路径。完整 Foundation 测试 90 pass / 0 fail。
    - REVIEW：2026-08-04 用户审查通过。

## 6. Cocos Application Adapter 与 AppRoot 组合入口

- [x] 6.1 先定义并验证 `adapters/cocos/application` 的边界：Adapter 只接收 Application 稳定生命周期 API，拥有运行时事件绑定/解绑职责；AppRoot 不出现 Cocos hide/show 事件常量，且 Composition Root 可以替换 Web、Native 或小游戏平台 Adapter。
- [x] 6.2 实现 Cocos Application Adapter，把 Cocos Runtime hide/show 事件分别转换为 running → pause、paused → resume；Adapter 不创建 Logger、ApplicationContext、Application 或 Module，不依赖 Game。
- [x] 6.3 建立显式 Composition Root 函数，按 Logger → ApplicationContext implementation → Application → Module 列表 → 当前平台 Adapter 的顺序装配，默认不创建任何禁止系统模块。
- [x] 6.4 实现 AppRoot Component 的 onLoad、start 和 onDestroy 主路径：只创建/连接对象、调用 Application start/dispose 和 Adapter bind/unbind，并确保异步启动错误进入 Logger；不得直接监听 hide/show。
- [x] 6.5 验证 onDestroy 先要求 Adapter 解除 Cocos 事件订阅再调用 dispose，重复销毁不会重复解绑或执行模块清理。
- [x] 6.6 通过 Cocos Creator 编辑器把 AppRoot 挂载到 `assets/boot/startup.scene`，设置唯一持久应用根，不手工修改 scene/meta JSON。
- [x] 6.7 在 Cocos Creator 3.8.8 Web Desktop 运行空应用主路径和 Adapter 前后台映射冒烟测试，验证 initialize/start/stop/dispose 日志顺序，以及 hide/pause、show/resume 基础映射；启动中事件、重复事件和失败组合延后。
- [x] 6.8 检查 startup.scene 和 AppRoot 中没有新增 Cocos 原生业务 UI、FairyGUI、资源加载、场景切换、Game 逻辑组件或平台事件转换逻辑。

## 7. 范围审查与最终验证

- [x] 7.1 运行完整 foundation 门禁 `bun run test:foundation && bun run test:foundation:types`，确认 ModuleGraph、ModuleRunner、Application 和 Logger 的运行时行为与契约类型均零失败。
    - GREEN：`bun run test:foundation` 133 pass / 0 fail（556 expect，25 文件）；`bun run test:foundation:types` 0 diagnostics、退出码 0。纯验证任务，无代码修改。
- [x] 7.2 运行 `test:foundation:types` 与项目类型检查、`git diff --check`，记录结果并区分当前配置基线与本 change 引入的问题。
    - `test:foundation:types` 0 diagnostics；`git diff --check` clean（工作区无未提交改动）。
    - 全项目 `tsc --project tsconfig.json --noEmit`：`assets/framework` 0 错误；`tests/` 全部错误均为既有基线（bun:test/node 类型缺失、ES2015 下 import.meta/动态导入/require 受限），与 Task 1.6 记录一致，本 change 未引入新问题。
- [x] 7.3 运行 Cocos Creator 3.8.8 Web Desktop 构建/预览冒烟验证，确认 AppRoot 脚本已正确导入且无组件或序列化错误。
    - Creator 3.8.8 加载项目成功（`asset-db is ready!`），脚本编译无错误；`startup.scene` 含 AppRoot 节点与唯一组件，压缩 UUID `fa179zIYl5AH5WyFFEuwP2V` 匹配 `AppRoot.ts.meta`。
    - `temp/programming` 编译产物确认 AppRoot/ConsoleLogger/CocosApplicationAdapter/ApplicationContext 全部正确编译且 import 解析成功；无组件缺失或序列化错误。
    - 仅有的 `cocos-service` `msg not exist` 为 Creator 3.8.8 扩展基线问题，与 Framework 无关；Web Desktop 预览运行期行为待用户在编辑器中点击 Preview 人工确认。
- [x] 7.4 扫描新增文件和 import，确认不存在 UI、FairyGUI、Resource、Asset Bundle、Scene、ECS、网络、战斗或游戏业务实现与占位接口，并重新执行内部依赖矩阵：core 不依赖 Cocos、contracts 不依赖具体实现、application/Framework 不依赖 Game、diagnostics/logging 只依赖 logging contract 和必要 core。
    - 禁止系统关键词扫描（framework + boot 全部 .ts）与目录检查（`assets/game` 不存在、`core/` 仅空目录 + meta）均无违规。
    - 全量 import 扫描与 `public-boundary.test.ts` 13 pass / 0 fail 共同验证依赖矩阵：core 无 Cocos、contracts 仅同层、application 无 Game/diagnostics、diagnostics 仅 logging contract、adapter 唯一允许 cc、Framework 无 Game/boot、无根 barrel 反向导入。
- [x] 7.5 审查公共导出白名单，确认只暴露稳定 ApplicationContext/Application/Module/Logger contracts、必要启动类型和允许捕获的错误；ModuleGraph、ModuleRunner、ApplicationContext 可变实现、MemoryLogger、Console 格式化细节和 Cocos Adapter 内部实现不得被根入口暴露。
    - 根入口精确导出 13 项白名单（LogContext/Logger/LogLevel/LogRecord、ApplicationContext/ApplicationLifecycle/ApplicationState、Module/ModulePhase/ModuleRuntimeState、Application、ApplicationStateError、ModuleLifecycleError），无 `export *`。
    - `public-boundary.test.ts` L438-478 精确比对导出集合并拒绝 9 项内部实现泄露；ModuleGraph、ModuleRunner、createApplicationContext/InternalApplicationContext、ConsoleLogger/ScopedLogger/MemoryLogger、CocosApplicationAdapter 均未暴露。
- [x] 7.6 审查全局状态和生命周期，确认没有静态 Application/Logger 单例、重复持久节点、未清理模块，以及 AppRoot 直接监听平台事件、Adapter 未解绑或 AppRoot/Adapter 重复处理生命周期的问题。
    - framework 全目录扫描无 `static`/`globalThis`/`window.`/`singleton`/`getInstance`；场景仅 1 个 AppRoot 节点。
    - AppRoot 无 EVENT_HIDE/EVENT_SHOW/game.on/game.off（approot-composition 测试断言）；`onDestroy` 源码顺序 unbind 先于 dispose。
    - Adapter `bound` flag 防重复绑定，unbind 与 bind 对称；`cocos-adapter.test.ts` 覆盖重复绑定、解绑、pause/resume 拒绝不崩溃。
    - 重复 onDestroy、onDestroy 在 start 前调用均安全（幂等 + 可选链）；ModuleRunner dispose 将 initialized/started/paused/stopped 全部转 disposed，无未清理模块。
- [x] 7.7 整理实现文件、测试证据、Cocos 冒烟结果和剩余风险，等待代码 review，不自动开始后续 Framework 能力。
    - 已汇总实现文件清单（framework 13 个源码 + boot AppRoot/scene + 25 个测试文件）、门禁证据（133 pass / 0 fail + types 0 诊断）、Cocos 冒烟结果和剩余风险（预览人工确认、pause/resume 失败矩阵延后、strict:false 基线）。
    - Phase 7 全部任务完成，等待代码 review，不自动开始后续 Framework 能力。
