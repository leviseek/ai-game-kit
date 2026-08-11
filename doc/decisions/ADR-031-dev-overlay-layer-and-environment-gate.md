# ADR-031 Dev Overlay Layer Placement and Environment Gate

## 状态

Accepted

## 背景

开发（debug 构建包）环境下缺少对"游戏基础能力"的可见性：开发者无法快速看到启动运行时间、网络环境、设备型号、内存、FPS 等运行时信息。需要"在场但不打扰"的开发态信息层：默认收缩为贴边悬浮球，悬停/点击展开完整信息，且仅在 debug 构建显示、release 完全关闭。

本 ADR 固化两个架构决策：dev overlay 的分层归属（工程能力独立模块，不进 framework 白名单、不进 samples 品类），以及环境开关策略（cc 宏 + URL 覆盖、release 关闭）。

既有先例：`boot/smoke/` 是"工程能力独立模块"先例（组合根装配、独立于品类生命周期）；`AppRoot` 的 `getSearch` 冒烟分派先例证明 URL 参数经组合根注入而非模块内读取；framework 公开 API 白名单（`assets/framework/index.ts`）只 re-export 稳定契约，适配器（`CocosStorageAdapter`/`CocosInputAdapter`）经组合根直接 import、不进白名单。动画约束见 ADR-029（TS 驱动 + 注入 timeSource，禁 transition）。

## 决策

### 1. 分层归属：独立 dev 模块 `assets/boot/dev/`，经 AppRoot 装配

新建 `assets/boot/dev/`（`dev-env.ts` 环境开关 / `dev-info.ts` 采样器 / `dev-ball.ts` 悬浮球控制器 / `dev-overlay.ts` 装配入口 / `dev-clock.ts` 表现时钟 / `dev-profiler.ts` Profiler 采样器），对齐 `boot/smoke/` 先例。`AppRoot`（组合根）在 BootFlow UI 根就绪后、打开列表页前，若 `isDevEnabled()` 为 true 则挂载 overlay 到全局常驻作用域；dev 关闭默认不创建（保证既有 approot 测试路径不变）。overlay 生命周期随 AppRoot 持有，`onDestroy` 释放；重复挂载幂等。

理由：dev overlay 是工程能力非产品契约。挂品类 bundle 生命周期不符（需跨会话常驻）；挂 framework 白名单代价高且无收益（不新增公开 API，适配器走组合根直接 import）。备选（混入 samples 品类）被否：品类随会话加载/释放，不满足常驻语义。

### 2. 环境开关：可注入 `isDevEnabled()`，cc/env DEBUG 宏为主 + URL 覆盖

`dev-env.ts` 提供 `createIsDevEnabled({ ccDebug, search })`：`ccDebug`（debug 构建标志，组合根注入 `cc/env` 的 `DEBUG` 宏）为主，URL `?dev=0` 强制关闭、`?dev=1` 强制开启；非法参数（非 0/1）不抛错回退默认。纯 TS 测试注入固定值（无 `cc.DEBUG`/`cc/env`）。

理由：`cc/env.DEBUG` 在非 Cocos 测试环境不可用，必须走组合根注入而非模块内直接读宏（对齐 AppRoot `getSearch` 冒烟分派先例）。URL 强制覆盖为开发者提供构建配置漂移时的逃生舱（design risk 表首行）；release 构建 `DEBUG=false` 且无 URL 覆盖时整体关闭，零 UI 开销。

### 3. 时间源：运行时间用墙钟、表现动画用 GameClock

运行时间采样读取注入的墙钟 `WallClock`（差值格式化 mm:ss，真实流逝语义，不依赖表现时钟）；悬浮球动画（贴边插值/面板淡入淡出）由 framework `GameClock` 驱动（ADR-029：动画器只读注入的 `now()`，禁 transition）。`AppRoot` 不直接 `new GameClock`（组合根 new 白名单约束，task68），由 `boot/dev/dev-clock.ts` 工厂创建并驱动。

理由：运行时间是墙钟语义（离线/真实流逝），动画是表现时间语义（可被全局 rate/pause 控制）；三时间域划分见 ADR-029 C-01，dev overlay 复用不新建。

### 4. FGUI 视觉与 TS 交互分离

视觉承载于新包 `DevOverlay`（`DevOverlayBall.xml` 收缩小球 + `DevOverlayPanel.xml` 信息面板），委派 fgui-designer 创建、`bun run fgui validate --strict` 通过、禁 graph/transition、纯色用 sprite 生成、仅跨包引 Common；交互与动画全部 TS 驱动（fgui 事件桥接在 `framework/adapters/cocos/ui/DevOverlayViewHandle.ts` Adapter 边界，AppRoot 不直接 import fgui）。

理由：对齐项目动画约束（ADR-029）与 FGUI 工作流约束（AGENTS.md）；fgui 类型只存在于 Adapter 边界。

## 理由

- 分层正确：工程能力独立于品类生命周期与 framework 白名单，组合根（AppRoot）唯一装配入口。
- 双保险关闭：release（DEBUG=false）+ URL 显式关闭均不创建，杜绝残留。
- 可测试：纯逻辑（环境开关/采样/贴边/状态机/装配幂等）全量 Bun 单测可注入驱动；fgui/cc 仅在组合根与 Adapter 边界。
- 不回归：dev 关闭默认不创建，既有 approot 装配测试注入 `isDevEnabled=false` 保持路径不变。

## 影响

- 新增 `assets/boot/dev/`（dev-env/dev-info/dev-ball/dev-overlay/dev-clock）；`AppRoot` 经 `setupDevOverlay` 薄转发装配（`isDevEnabled` 门控 + GRoot 重试 + dispose）。
- 新增 `CocosDeviceInfo` 适配器（`assets/framework/adapters/cocos/device/`）与 `DevOverlayViewHandle`（`adapters/cocos/ui/`），均不进 framework 公开 API 白名单。
- Profiler 采样 `sampleProfilerStats` 归置 `assets/boot/profiler.ts`（冒烟与 dev overlay 共用，避免冒烟反向依赖 dev 模块）。
- FGUI 新包 `DevOverlay`（`DevOverlayBall`/`DevOverlayPanel`），独立发布 `assets/ui/DevOverlay/`，不触碰既有包产物。
- 无破坏性变更：不改 framework 白名单、不改 `DeviceInfo` 契约形状、不动品类生命周期。
- 落地 change：`dev-overlay`。

## 审查补充（ai-sensei 深度审查后确认）

- **dev 专用 fgui 视图临时借住 adapters**：`DevOverlayViewHandle` 是 dev-overlay 专用、不实现 framework 契约，但为集中 fgui 类型边界（AGENTS 强约束）暂放 `adapters/cocos/ui/`；未来不得继续向 adapters 塞业务专用文件。
- **`MotionTween` 不进白名单**：纯 TS 通用动画能力，当前唯一消费者是 dev-ball（boot 层），符合 ADR-031"不新增公开 API"；若 samples（vs-entrance/effect-animator 自实现 ease）未来迁移复用，需重新评估进白名单。
- **AppRoot 装配外移**：dev overlay 组装（loadPackage/采样器/时钟/重试/竞态守卫）收敛到 `setupDevOverlay`，对齐 SmokeProxy 外移先例；AppRoot 只保留薄转发 + dispose。
- **已知限制**：AppRoot 的 dev 开启全链路（DEBUG=true）因 bun mock.module 全局共享（cc/env 首个注册生效）无法可靠单测，装配核心由 `setupDevOverlay` 测试覆盖；AppRoot 接线由 source 断言 + DEBUG=false 路径兜底。
