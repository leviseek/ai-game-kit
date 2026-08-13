# Design: dev-overlay

## Context

需求动机见 `proposal.md - Why`。项目结构：framework 公开 API 白名单（`assets/framework/index.ts`）仅 re-export 契约类型与少量核心类；`boot/AppRoot.ts` 是组合根（装配 `Application`/`UiHost`/`GameLobbyHostImpl`/`SmokeProxy`/`BootFlow`），`boot/smoke/` 是"工程能力独立模块"先例；`game/fixture/perf.ts` 已有 `PerfSampler`（从 Cocos Profiler 取 FPS/内存/纹理/缓冲）；`DeviceInfo` 契约仅 `platform/model/language`，目前唯一实现是 `MemoryPlatform`。FGUI 工作流约束见 AGENTS.md（fgui-designer 委派、validate --strict、禁 graph/transition、纯色 sprite 生成、跨包仅 Common）。动画约束见 ADR-029（TS 驱动 + 注入 timeSource，禁 transition）。验收见 `specs/dev-overlay/spec.md`。

## Goals / Non-Goals

**Goals:**

- debug 构建启用、release 关闭且无残留（可注入 `isDevEnabled` + URL 覆盖）。
- 悬浮球（收缩 + 展开面板）展示运行时间/平台型号/网络/FPS/内存；拖拽 + 贴边吸附；鼠标悬停展开 + 触摸点击切换。
- 挂载到全局 UI 最上层、跨会话常驻、重复挂载幂等。
- 分层正确：不进 framework 白名单、不进 samples 品类，独立 dev 模块经 AppRoot 装配。

**Non-Goals:**

- 不做存储目录、进程内存、完整性能统计面板（MVP 见 proposal）。
- 不做原生平台支持（用户确认仅 Web）。
- 不新增 framework 公开 API、不改 `DeviceInfo` 契约形状。
- 不触碰品类 presenter/fixture 生命周期。

## Decisions

### 1. 分层：独立 dev 模块 `assets/boot/dev/`，经 AppRoot 装配

新建 `assets/boot/dev/`（`dev-overlay.ts` 装配入口 / `dev-info.ts` 采样器 / `dev-ball.ts` 悬浮球控制器 / `dev-env.ts` 环境开关），对齐 `boot/smoke/` 先例。`AppRoot` 在 `BootFlow` 启动流程的 UI 根就绪后、默认流程打开列表页前，若 `isDevEnabled()` 为 true 则挂载 overlay 到全局常驻作用域；dev 关闭默认不创建（保证既有 `approot-composition` / `approot-ui-smoke` 测试路径不变）。

理由：dev overlay 是工程能力非产品契约，挂品类 bundle 生命周期不符（需跨会话常驻），挂 framework 白名单代价高且无收益。备选（混入 samples 品类）被否：品类随会话加载/释放。

### 2. 环境开关：可注入 `isDevEnabled()`，cc 宏为主 + URL 覆盖

`dev-env.ts` 提供 `createIsDevEnabled({ ccDebug, search })`：`ccDebug`（debug 构建标志）为主，URL `?dev=0` 强制关闭、`?dev=1` 强制开启。组合根传入 `cc.DEBUG` 与 `window.location.search`；纯 TS 测试注入固定值（无 `cc.DEBUG`）。

理由：`cc.DEBUG` 在非 Cocos 测试环境不可用，必须走组合根注入而非模块内直接读宏（对齐 AppRoot `getSearch` 冒烟分派先例）。

### 3. 信息采样器：复用 perf + 新增 CocosDeviceInfo + 网络薄适配

- 运行时间：注入 `TimeSource`（墙钟），记录起点，差值格式化 `mm:ss`。**不用 GameClock**（表现时间，可暂停/变速）。
- 平台/型号/语言：新增 `CocosDeviceInfo` 适配器（`assets/framework/adapters/cocos/`）实现既有 `DeviceInfo` 契约，读 `cc.sys.os`/`cc.sys.platform`/`cc.sys.language`；结构化接缝 + 测试可注入（对齐 `CocosStorageAdapter` 模式）。**不进白名单**，dev 层直接 import 适配器类。
- 网络：Web 薄适配 `navigator.onLine` + `navigator.connection.effectiveType`（不可用时降级 "unknown"）。
- FPS/内存：复用 `game/fixture/perf.ts` 的 `PerfSampler`（组合根/AppRoot 注入 Profiler 采样器）。

理由：复用既有能力避免重复；`CocosDeviceInfo` 补齐契约唯一实现缺口。备选（dev 层直接读 `cc.sys`）被否：违反适配集中模式。

### 4. UI：FGUI `DevOverlayBall` + `DevOverlayPanel`，TS 控制器

- FGUI 新包 `DevOverlay`（委派 fgui-designer）：`DevOverlayBall.xml`（收缩小球，纯色 sprite 生成 + 可选 FPS 徽标文本）、`DevOverlayPanel.xml`（信息面板：若干 text 节点 + 背景）。exported 组件名全局唯一（`fgui validate` 强制），包内自足，仅跨包引 Common。
- `dev-ball.ts` 控制器：持有球/面板的 `ViewModelNode`（经 UiHost 的节点解析器），实现状态机 `collapsed → dragging → snapping → expanded`。
- 拖拽：FGUI `TOUCH_BEGIN/MOVE/END`（统一触摸/鼠标），按触点位移 `setXY` 更新；拖动中停用吸附。
- 贴边：球默认贴着 UI 根左上角悬浮常驻（初始 `x` 露头、`y=0` 顶贴齐），面板位于球右侧；拖拽是临时位置调整，释放后**固定回到左侧贴边**（x 露头、y 保留并钳制在边界内），动画插值过去。边界以 `GRoot.width/height`（设计分辨率）为准，勿用物理像素。
- 展开/收起：鼠标 `ROLL_OVER` 悬停展开、`ROLL_OUT` 移出收起；点击（轻点）不改变展开状态，仅触发预留的 `onTap` 回调（当前 no-op，日后以注册方式接入 GM 面板）。
- 动画：TS 插值（位移/alpha/visible），动画器只读注入的 `timeSource.now()`（framework `GameClock` 驱动，ADR-029），禁 transition。

理由：FGUI 组件承载视觉、TS 承载交互与动画，符合项目动画约束；悬浮球最小化遮挡且信息量可扩展。

### 5. 常驻与生命周期

overlay 挂载到全局 UI 作用域（对齐 Common 常驻方式），持有于 AppRoot 生命周期；`AppRoot.onDestroy` 释放。挂载幂等（重复调用只创建一次）。

理由：品类会话退出不应释放 dev 工具；幂等防重复挂载。

## Risks / Trade-offs

- [`cc.DEBUG` 与构建配置漂移] → 环境开关走组合根注入 + URL 覆盖双保险，release 构建默认关闭不创建。
- [悬停仅鼠标，触摸无 hover] → 面板展示依赖鼠标悬停；触摸端保留拖拽与 FPS 徽标，点击预留 GM 回调，不依赖悬停。
- [贴边用物理像素导致错位] → 以 GRoot 设计分辨率尺寸为边界，复用 `CocosUiRoot` 已同步设计分辨率的语义。
- [AppRoot 装配改动破坏既有测试] → dev 关闭默认不创建 + 测试注入 `isDevEnabled=false`，保持既有路径不变。
- [采样开销影响性能] → 收缩态仅低频刷新关键信息（FPS），展开才全量采样；release 关闭零开销。

## Migration Plan

- 新增模块与包，无既有行为迁移；dev 关闭时 AppRoot 路径与现状一致。
- FGUI 新包 `DevOverlay` 独立发布，不触碰既有包产物。
- 无破坏性变更（不改 framework 白名单、不改 DeviceInfo 契约、不动品类生命周期）。

## Open Questions

无（目标平台=仅 Web、dev 定义=debug 构建包、MVP 范围已由用户确认，剩余不确定性在实现阶段以测试收敛，不改变 spec 与任务拆分）。
