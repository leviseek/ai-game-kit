# Change: dev-overlay

## Why

开发（debug 构建包）环境下缺少对"游戏基础能力"的可见性——开发者无法快速看到启动运行时间、网络环境、设备型号、内存、FPS 等运行时信息，排查问题时需反复切换工具。需要一个"在场但不打扰"的开发态信息层：默认收缩为贴边悬浮球，悬停/点击展开完整信息，且仅在 debug 构建显示、release 完全关闭。

## What Changes

- 新增 dev overlay 模块（工程能力层，不进 framework 白名单、不进 samples 品类），挂载到全局 UI 常驻作用域，跨品类会话存活。
- **环境开关**：封装可注入的 `isDevEnabled()`——debug 构建包（`cc.DEBUG`/`BUILD` 宏）为主 + URL 参数 `?dev=1`/`?dev=0` 强制覆盖；release 构建默认关闭。
- **信息源**：启动运行时间（墙钟 `TimeSource` 差值）、平台/设备型号/语言（新增 `CocosDeviceInfo` 适配器实现既有 `DeviceInfo` 契约）、网络环境（Web `navigator.onLine`/`connection`）、FPS 与内存（复用 `game/fixture/perf.ts` 的 `PerfSampler`）。
- **UI 形态（方案 B：悬浮球）**：FGUI 组件 `DevOverlayBall`（收缩小球，纯色 sprite 生成）+ `DevOverlayPanel`（展开信息面板）；TS 驱动拖拽、贴边吸附、展开/收起动画（禁 transition，注入 timeSource，对齐 ADR-029）。
- **交互**：拖拽移动（TOUCH 事件统一触摸/鼠标）、释放回左侧贴边、鼠标悬停展开/移出收起；点击预留回调（no-op，日后经注册接入 GM 面板）。
- **MVP 信息项**：运行时间、平台/型号、网络状态（在线/离线 + effectiveType）、FPS、内存（texture/buffer MB）。**不做**：存储目录（Web 无目录语义）、进程内存、完整性能统计面板。

## Capabilities

### New Capabilities

- `dev-overlay`: 开发环境（debug 构建）信息悬浮球——环境开关、运行信息采样、FGUI 悬浮球交互（拖拽/贴边/展开收起）、全局常驻与 release 关闭。

### Modified Capabilities

- 无（新增独立能力，不改既有 spec 级行为）。

## Impact

- 新增 `assets/boot/dev/`：`dev-overlay.ts`（装配入口，GRoot 就绪后挂载、幂等）、`dev-info.ts`（信息采样器）、`dev-ball.ts`（悬浮球控制器：拖拽/贴边/展开状态机 + 动画器）、`dev-env.ts`（可注入 `isDevEnabled`）。
- 新增 `CocosDeviceInfo` 适配器（`assets/framework/adapters/cocos/`）：实现既有 `DeviceInfo` 契约，`cc.sys` 读取，结构化接缝 + 测试可注入。
- FGUI：新包 `DevOverlay`（`DevOverlayBall.xml` + `DevOverlayPanel.xml`，委派 fgui-designer + `bun run fgui validate --strict`；纯色用 sprite 生成，禁 graph/transition）。
- 装配：`AppRoot` 增加 dev overlay 分支（dev 关闭默认不创建，保证既有测试路径不变）；`UiHost`/全局 uiScope 复用（只读）。
- 测试：新增模块纯逻辑（贴边计算、状态机、采样格式化、环境开关）Bun 单测；`AppRoot` 装配测试注入 `isDevEnabled=false` 保持既有行为。
- 新增 ADR（编号顺延）：dev overlay 分层归属 + 环境开关策略。
