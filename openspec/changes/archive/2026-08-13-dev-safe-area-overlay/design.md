## Context

现有 dev overlay 已建立清晰分层：boot/dev 层写纯逻辑控制器 + 注入接缝（`DevBallController` 的 `readBounds`/`timeSource`/`node`），framework Adapter 层写 fgui/cc 薄壳（`DevOverlayViewHandle` 注释明确"fgui 类型只存在于本文件；dev 层消费本句柄而不直接 import fgui"）。`CocosUiRoot.onResize` 已是权威 resize 链路（window resize → GRoot.setSize → 监听者携带更新后 GRoot 尺寸），`GRootLike` 是唯一权威容器形状。`DevInfoSamplerOptions` 已有 clock/device/navigator/perf 四个注入接缝。FGUI 约束：禁止 XML `<graph>`、纯色用 sprite 像素图、跨包只允许引用 Common、新建颜色进 palette.json、字符串归口三问。

## Goals / Non-Goals

**Goals:**
- 安全区虚线框：纯逻辑控制器（可单测）+ Adapter 视图薄壳，框与悬浮球面板展开联动。
- 分辨率采样：扩 `DevInfo`/`DevInfoSamplerOptions`，面板展示物理/逻辑/GRoot 适配三组数值。
- 所有读数实时（防创建时快照），值变化才重绘（脏检查）。

**Non-Goals:**
- 不做框的动画（呼吸/闪烁），静态虚线框对调试已足够（YAGNI）。
- 不引入 safe area 策略/组件本身，仅可视化现有 inset。
- 不接入 GM 面板（沿用 onTap 预留模式）。

## Decisions

### 1. 像素图 9-slice 承载虚线，而非运行时 GGraph

运行时 `new GGraph()` 不违反 XML graph 禁令（项目已有 `createFairyGuiMask` 先例），但 GGraph 仅支持实线，虚线需 hack 底层或逐段建对象，脆弱。改为 `bun run fgui sprite` 生成黄色虚线单元像素图（进 palette.json），四边各一条 `<image>` 用 9-slice fill 拉伸：虚线即图本身、缩放由 FGUI 渲染管线处理、零 hack。
- 备选 A：GGraph 实线——快速但非等比缩放下矢量线宽变形，且无虚线 API。
- 备选 C：cc.Graphics 挂 GRoot——虚线自由但引入第二套坐标系/层级体系，违背"fgui 类型只在 Adapter 边界"精神。

### 2. 分层：控制器在 boot/dev，视图在 Adapter

- `SafeAreaOverlayController`（boot/dev，纯逻辑）：注入 `readSafeArea()`、`readBounds()`、`now()`，`step()` 重算 rect + 脏检查，经 `setRect` 回调到视图。与 `DevBallController` 同模式，可单测。
- `SafeAreaOverlayViewHandle`（framework/adapters/cocos/ui）：创建 9-slice 虚线框组件挂 GRoot、`setRect(rect)`、`dispose()`。fgui 类型不泄漏到 boot 层。
- viewport/safe area 物理读取（`import * as cc`）落 Adapter 层新封装（如 `CocosViewportInfo`），经注入接缝供 boot 消费——对齐 `createCocosDeviceInfo` 先例。

### 3. 跟随 resize：onResize 事件 + 低频轮询兜底 + 脏检查

- 事件层订阅 `CocosUiRoot.onResize`（回调携带更新后 GRoot 尺寸，天然排除物理像素≠rootSize 时序坑）。
- safe area inset 变化（真机刘海/旋转）不一定伴随 window resize，故叠加低频轮询兜底——复用 `REFRESH_MS` 节奏：`step()` 实时读 safe area + bounds，比较后才重绘。
- 反模式：挂载时缓存快照（readBounds 已踩过）、每帧无条件 setSize 干扰 FGUI 显示列表优化。

### 4. 分辨率取值来源

- 实际分辨率（物理像素）：Adapter 层读 `cc.view.getVisibleSizeInPixel()`；逻辑/CSS 像素 = 物理 ÷ `cc.screen.devicePixelRatio`（实测：`cc.view.getVisibleSize()` 是设计分辨率尺寸非 CSS 像素）。两者都显示，格式 `1170×2532 (css 390×844)`。
- 安全区 inset：`cc.sys.getSafeAreaRect()`（设计分辨率坐标系，非异形屏返回全屏），换算为相对 GRoot 容器的四边 inset。API 分布实测确认：`getSafeAreaRect` 在 `cc.sys`、`getVisibleSizeInPixel` 在 `cc.view`、DPR 在 `cc.screen`。
- 适配后分辨率：`GRoot.width × GRoot.height`（权威值，非设计分辨率常量）。
- 扩 `DevInfo` 加 `viewport`/`uiSize` 字段，`DevInfoSamplerOptions` 加 `readViewport`/`readUiSize` 读取器接缝——复用既有注入模式，不新建 sampler。

### 5. 与面板展开联动

框可见性随 `DevBallController` 状态：panel alpha 动画期间同步框 alpha（或直接随展开/收起切换可见）。控制器经 `setFrameVisible(visible)` 回调到视图；`dispose` 时同步移除。生命周期随 `mountDevOverlay` 幂等表与 `setupDevOverlay` dev 开关门。

## Risks / Trade-offs

- **safe area 坐标系一致性**（`sys.getSafeAreaRect` 与 GRoot 比例）→ 真机打日志验证一致性；引擎文档声明 getSafeAreaRect 返回设计分辨率（rootSize）坐标系矩形，与 GRoot 同坐标系，但仍以真机验证为准。
- **非等比缩放下 9-slice fill 虚线被拉伸** → 调试工具可接受（框始终贴合边界），tile 模式为备选；dev 默认 fill。
- **编辑器 vs 真机差异**（编辑器 getSafeAreaRect 无 inset 返回全屏）→ 面板显示 inset 数值辅助判断数据源。
- **方向变化漏事件**（移动端旋转只触发 orientationchange）→ 低频轮询兜底必须，不依赖 resize 事件。
- **非 dev 环境泄漏** → 全部能力挂在 `mountDevOverlay` 的 `isDevEnabled()` 门后。
- **FGUI 流程红线** → 改 XML/加像素图必须委派 fgui-designer（`/fgui-edit`），新色进 palette.json，`ui/generated` 与节点常量同步，`bun run fgui validate --strict` 通过后才发布。
