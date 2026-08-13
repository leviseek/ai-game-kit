## Why

开发环境下排查适配问题时，缺少两个关键可视化工具：无法直观看到安全区（safe area）的边界，也无法在悬浮球上快速核对"当前物理/逻辑分辨率 vs 适配后（GRoot）分辨率"。目前 dev overlay 只展示运行时间、设备、网络、FPS、内存，不覆盖适配维度；设计分辨率（design D4）与真实 safe area inset 差异在真机刘海屏、非等比缩放策略下难以察觉。

## What Changes

- 新增开发环境**安全区虚线框**：黄色虚线矩形，标注 safe area 边界；**仅悬浮球信息面板展开时显示**（与面板联动，收起即隐藏）。
- 安全区框采用**像素图 9-slice** 实现（`bun run fgui sprite` 生成黄色虚线单元像素图，FGUI `<image>` 引用，杜绝 XML `<graph>`）。
- 安全区框**随屏幕缩放/拉伸跟随变化**：实时读取 safe area inset 与 GRoot 尺寸，值变化才重绘（脏检查），不在挂载时缓存快照。
- 悬浮球信息面板新增两行：**实际分辨率**（物理像素 + 逻辑/CSS 像素）与**适配后分辨率**（GRoot 尺寸）。
- 全部能力仅 dev 环境启用，release 无任何残留；扩展 `DevInfo`/`DevInfoSamplerOptions` 采样接缝。

## Capabilities

### New Capabilities

- `dev-safe-area-overlay`: 开发环境安全区虚线框的可视化显示，含实时跟随屏幕缩放/拉伸与生命周期控制。

### Modified Capabilities

- `dev-overlay`: 信息采样与面板展示新增分辨率信息（物理像素、逻辑像素、GRoot 适配尺寸）。

## Impact

- `assets/boot/dev/`：新增 `SafeAreaOverlayController`（纯逻辑控制器，注入 readSafeArea/readBounds/now 接缝）；扩展 `DevInfo.ts`（`DevInfo` 加分辨率字段、`DevInfoSamplerOptions` 加读取器接缝）。
- `assets/framework/adapters/cocos/ui/`：新增 `SafeAreaOverlayViewHandle.ts`（像素图虚线框视图句柄，fgui 类型仅存于本文件）；可能扩展 `DevOverlayViewHandle.ts`（展开/收起联动）。
- `assets/framework/adapters/cocos/`：新增 viewport/safe area 读取封装（物理像素 + safe area rect，`import * as cc` 仅限 Adapter 层）。
- `assets/boot/dev/DevOverlay.ts`：装配串接（sampler 注入新读取器、safe area 控制器与面板联动、dev 关闭 no-op）。
- FGUI 资源：`ui/demo/assets/DevOverlay` 包新增黄色虚线像素图（进 `palette.json`）与框组件，需经 **fgui-designer** 产出并 `bun run fgui validate --strict` 通过；`ui/generated/` 类型更新。
- 测试：`tests/framework/foundation/` 新增控制器单测（rect 计算、脏检查、防快照、分辨率采样）。
