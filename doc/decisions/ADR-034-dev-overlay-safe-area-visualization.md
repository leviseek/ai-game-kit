# ADR-034: Dev Overlay Safe Area Visualization and Resolution Sampling

## Status

Accepted

## Context

dev overlay（ADR-031）覆盖了运行时间/设备/网络/FPS/内存等运行信息，但缺少适配维度可视化：开发者无法直观看到安全区（safe area）边界，也无法快速核对"物理/逻辑分辨率 vs 适配后（GRoot）分辨率"的差异。在真机刘海屏、非等比缩放策略（FIXED_WIDTH/SHOW_ALL）下，设计分辨率（design D4）与真实 safe area inset 的差异难以察觉。

需要新增两个开发设施：安全区虚线框（黄色虚线，随屏幕缩放/拉伸实时跟随，仅悬浮球面板展开时显示）与面板分辨率采样（物理像素 + 逻辑/CSS 像素 + GRoot 适配尺寸）。

## Decision

### 1. 分层归属：复用 ADR-031 模式，控制器在 boot/dev、视图在 Adapter

安全区框拆为两层，与 `DevBallController`/`DevOverlayViewHandle` 同构：

- `SafeAreaOverlayController`（`assets/boot/dev/`）：纯逻辑控制器，注入 `readSafeArea()`/`readBounds()`/`timeSource`，`step()` 重算矩形 + 脏检查，经 `onRect`/`onVisible` 回调输出。零 fgui/cc 依赖，可单测。
- `SafeAreaOverlayViewHandle`（`framework/adapters/cocos/ui/`）：创建 `SafeAreaFrame` FGUI 组件挂 GRoot，`setRect`/`setVisible`/`dispose`。fgui 类型只存在于本文件，dev 层经注入接缝消费。

理由：对齐 ADR-031"boot/dev 写可测纯逻辑 + 注入接缝、Adapter 写 fgui/cc 薄壳"的分层原则；框与悬浮球共享同一生命周期（`setupDevOverlay` 装配、dev 门控、幂等表）。

### 2. 虚线框选型：像素图 9-slice，而非运行时 GGraph

运行时 `new GGraph()` 不违反 XML `<graph>` 禁令（已有 `createFairyGuiMask` 先例），但 GGraph 无虚线 API（虚线需 hack 底层或逐段建对象，脆弱）。改用 `bun run fgui sprite` 生成黄色虚线单元像素图（颜色进 `palette.json`），四边各一条 `<image>` 以 9-slice fill 拉伸。

理由：虚线即图本身、缩放/拉伸由 FGUI 渲染管线全权处理，无需代码模拟虚线；不触碰"禁 graph"约束的解释边界。备选 cc.Graphics 挂 GRoot 被否——引入第二套坐标系/层级体系，违背"fgui 类型只在 Adapter 边界"。

### 3. 跟随 resize：CocosUiRoot.onResize 事件 + 低频轮询兜底 + 脏检查

- 事件层订阅 `CocosUiRoot.onResize`（回调携带**已更新后的 GRoot 尺寸**，天然排除"物理像素 ≠ rootSize"的时序坑，见 `CocosUiRoot.handleResize`）。
- safe area inset 变化（真机刘海、旋转 orientationchange）不一定伴随 window resize，叠加低频轮询兜底——复用 `REFRESH_MS` 节奏，`step()` 实时读 inset + bounds，值变化才重绘。
- 反模式：挂载时缓存快照（`DevBall` 的 `readBounds` 已踩过此坑）、每帧无条件 setSize 干扰 FGUI 显示列表优化。

理由：事件负责"及时"、轮询负责"兜底"、脏检查负责"不浪费"、实时读取负责"不踩快照"，四者合一方为完整答案。

### 4. 分辨率取值来源：物理像素读 Adapter、适配后读 GRoot

- 实际分辨率：物理像素（`cc.view.getVisibleSizeInPixel()`）+ 逻辑/CSS 像素（物理 ÷ `cc.screen.devicePixelRatio`），封装为 `CocosViewportInfo`（`framework/adapters/cocos/viewport/`，`import * as cc` 仅限本文件，惰性接缝可注入）。
- 安全区 inset：`cc.sys.getSafeAreaRect()`（**设计分辨率坐标系**，非异形屏返回全屏 Rect），换算为相对 GRoot 容器的四边 inset。API 分布实测确认：`getSafeAreaRect` 在 `cc.sys`、`getVisibleSizeInPixel` 在 `cc.view`、DPR 在 `cc.screen`；`cc.view.getVisibleSize()` 是设计分辨率尺寸而非 CSS 像素，不能用作逻辑像素。
- 适配后分辨率：`GRoot.width × GRoot.height`（权威值，非设计分辨率常量；`DevBall.readBounds` 已验证此路）。
- `DevInfo` 加 `viewport`/`uiSize` 字段，`DevInfoSamplerOptions` 加 `readViewport`/`readUiSize` 读取器接缝——复用既有注入模式，不新建 sampler。

### 5. 与面板展开联动

框可见性随 `DevBallController` 展开/收起：`DevBallOptions` 加可选 `onExpandChange` 回调（展开 true/收起 false），`DevOverlay.ts` 装配层经它驱动 `safeAreaController.show()/hide()`。收起态 `step()` 不重算（静默保留最后 rect），避免无谓重绘。

## Consequences

- 新增 `SafeAreaOverlayController`、`SafeAreaOverlayViewHandle`、`CocosViewportInfo` 三个文件；`DevOverlay.ts` 装配收敛 viewport 与 safeArea 配置，`AppRoot` 只传 `createSafeAreaView`。
- `DevInfo`/`DevInfoSamplerOptions` 增字段与接缝（向后兼容，读取器缺省为 null）。
- FGUI 新增 `SafeAreaFrame` 组件（`frame_top/bottom/left/right` 四边 image）与虚线像素图，均经 fgui-designer 产出、`validate --strict` 通过。
- 生命周期随 `mountDevOverlay` 幂等表与 `setupDevOverlay` dev 门控：release 零残留。
- 已知风险：`view.getSafeAreaRect()` 与 GRoot 坐标系一致性需真机打日志验证（若返回物理像素需手动换算）；编辑器下 `getSafeAreaRect()` 返回全屏无 inset，属正常差异（面板显示 inset 值辅助判断）。
- 无破坏性变更：不修改 framework 白名单、不改既有 `DevInfo` 消费方形状（新增字段为可选接缝）。
- 落地 change：`dev-safe-area-overlay`。
