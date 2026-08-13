# 框架使用与扩展说明

面向在 `ai-game-kit` 上新增玩法能力或平台能力的开发者。本文档覆盖：目录与依赖规则、模块组合方式、资源所有权、错误处理约定，以及新增能力必须走独立 OpenSpec change 的流程。与各决策记录（`doc/decisions/ADR-*.md`）配套阅读。

## 目录与依赖规则

```
assets/
  boot/                 应用组合根（AppRoot、assembleApp），唯一允许依赖游戏层装配的地方
  framework/
    index.ts            框架公开 API 白名单，业务代码的推荐导入入口
    core/               纯 TypeScript 内核（禁 cc / fgui）
    contracts/          稳定契约接口与数据边界（禁依赖实现）
    application/        应用内核与模块生命周期
    diagnostics/        日志与诊断
    adapters/
      cocos/            引擎适配（application/audio/config/input/resource/scene/storage/ui）
      memory/           纯内存测试适配器
  game/
    fixture/            品类夹具公共契约（GameFixture）、登记表与冒烟驱动
  game_rpg/ ...        五类组合夹具（业务模型全部位于这些游戏层目录）
```

依赖方向被 `tests/framework/foundation/public-boundary.test.ts` 与 `task68-scope-review.test.ts` 机械锁定：

- `framework/core` 不导入 `cc`/`fgui`；`contracts` 只描述契约、不依赖实现；框架整体不导入 `game`（见 ADR-005）。
- 业务代码只经根入口 `../framework` 导入稳定符号；禁止深层导入框架内部实现（`findProjectImportViolations` 全量扫描）。
- 游戏层（`game`/`game_*`）禁止导入 `fairygui(-cc)`；UI 呈现一律经 ViewModel + FairyGUI Adapter。
- 组合根 `boot/AppRoot` 可依赖游戏层做冒烟装配（薄转发），游戏层不得反向依赖 `boot`。
- 五类夹具建设中 `core` + `contracts` 零改动是内核边界口径，新增能力同样应遵守（见 ADR-018）。

## 模块组合

框架采用显式模块清单装配，不做自动扫描。业务模块实现 `Module` 契约：

```ts
export interface Module {
    readonly id: string;
    readonly dependencies: readonly string[];
    initialize?(ctx: ApplicationContext): void | Promise<void>;
    start?(ctx: ApplicationContext): void | Promise<void>;
    pause?(ctx: ApplicationContext): void | Promise<void>;
    resume?(ctx: ApplicationContext): void | Promise<void>;
    stop?(ctx: ApplicationContext): void | Promise<void>;
    dispose?(ctx: ApplicationContext): void | Promise<void>;
}
```

- `Application` 按依赖拓扑正序启动、逆序清理；启动中某模块失败时已启动模块逆序回滚，应用进入可重建终态。
- `ApplicationContext` 只提供 Logger 与只读生命周期状态，不含服务解析；业务代码禁止直接依赖 Context 做 Service Locator（ADR-012）。
- 服务经 `createServiceRegistry` + 类型化 `createServiceToken` 注册，由组合根显式创建并注入，非全局单例；装配前经 `validateRequiredTokens` 校验缺失/循环 token，失败在 `Application.start` 前同步抛错。
- 引擎无关的编排能力（状态机 `createStateMachine`、对象池 `createObjectPool`、调度 `PassiveScheduler`、作用域事件 `createScopedEventChannel`、UI 导航 `createUiNavigator`、输入映射 `createInputMapper` 等）均从根入口导出，供游戏层组合。
- 品类夹具统一走 `GameFixture` 公共契约（`assets/game/fixture/GameFixture.ts`）：声明模块清单 + `start/pause/resume/failRollback/dispose` 接缝，`registry.ts` 登记、`smoke.ts` 以统一序列驱动（ADR-018）。

## 资源所有权

资源以"作用域 + 全局引用计数"管理，核心是 `ResourceScope`（见 `contracts/resource/ResourceScope.ts`）：

- `scope.retain(handle)` 声明持有权（同资源重复 retain 幂等）；`scope.release()` 释放全部持有项，重复调用幂等。
- 仍被其他作用域引用或仍在加载的 Bundle 不会提前卸载；引用归零且无进行中加载时经 `unloadBundle` 接缝触发卸载执行器（Cocos 适配器执行 `releaseAll`/`removeBundle`）。
- 页面关闭按 View → FairyGUI package → Bundle 的逆序释放；`LoadCoordinator` 负责并发加载去重与失败/取消传播。
- 配置资源经 `kind: "asset"` 读取路径加载，与应用生命周期常驻、不触达存档后端（ADR-015）。

## 错误处理

- 全部框架错误继承 `FrameworkError`，携带模块/阶段上下文与可恢复性分类；`isRecoverableError` 供边界判断（ADR-007）。
- 领域错误类型化：`ApplicationStateError`、`ModuleLifecycleError`、`ServiceRegistrationError`/`ServiceResolutionError`、`ConfigLoadError`/`ConfigParseError`/`ConfigMissingError`/`ConfigTypeMismatchError`、`SaveCorruptionError` 等，均保留底层 `cause` 与资源标识。
- 回调与异步路径中的失败经隔离出口上报，不因单个处理器异常毁掉整批（事件通道、调度器、资源卸载、音频分组均如此）。
- 日志在写入点经 `redact.ts` 过滤敏感字段；标识符与 API 名保持英文，注释使用简体中文、只解释意图/限制/权衡。

## 新增平台/玩法能力的流程

框架 v1 明确不实现联网、热更新、ECS 与任何具体玩法（五类组合夹具的业务模型全部位于游戏层，负向断言由夹具测试锁定）。新增能力必须遵守既定依赖方向，并通过独立 OpenSpec change 走完整闭环：

1. **提案**（`openspec-propose`）：在 `openspec/changes/<name>/` 生成 `proposal.md`、`design.md`、`tasks.md` 与能力 delta specs；明确 Goals/Non-Goals，避免为假设需求预建通用抽象（每个通用能力至少需要两个品类场景证明复用价值）。
2. **实现**（`openspec-apply-change`）：按 `tasks.md` 以测试驱动方式逐项实现；每个实现单元运行最相关的门禁——`bun run test:foundation`、`bun run test:foundation:types`、`public-boundary.test.ts`、品类目录独立 strict 类型检查。
3. **架构决策**：实现引入新的架构决策时，按 `doc/decisions/ADR-NNN-<slug>.md` 创建 ADR 并同步总计划（`config.yaml` 的 apply/archive guidance）。
4. **同步与归档**（`openspec-archive-change`）：归档前将 delta specs 同步到主 specs（`openspec/specs/<capability>/spec.md`），`openspec validate --specs --strict` 通过后归档。

已知的后续候选：逐帧战斗内核（超出通用时钟替换边界）、联网校时与防作弊（本地时钟非可信）、热更新、ECS、支付/广告/账号/分享等平台能力、FairyGUI Runtime 或 Cocos 版本升级（需独立 change 验证兼容性）。
