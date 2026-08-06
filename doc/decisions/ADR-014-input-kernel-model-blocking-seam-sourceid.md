# ADR-014 Input Kernel Model, Blocking Seam, and SourceId Convention

## 状态

Accepted

## 背景

父级 `create-game-framework-v1` 第 6.4/6.5 节要求提供引擎无关的类型化 gameplay action 输入与 Cocos 输入适配：把触摸、鼠标、键盘和手柄底层事件映射为带状态与时间戳的 action，支持输入上下文切换与运行时输入源替换，并保证模态/UI 阻断时玩法上下文不误响应。总计划设计决策 10 已确立 UI 输入走 FairyGUI View→ViewModel、玩法输入走独立通道的分流边界；ADR-010 影响段明确"输入上下文阻断必须以导航模态状态为 UI 侧阻断依据"。本 ADR 记录 change `implement-input-and-gameplay-actions-v1` 落地的输入内核模型、阻断接缝与 sourceId 约定，供后续输入能力（输入缓冲、优先级、招式识别、多平台手柄矩阵）复用。

## 决策

### 1. 输入内核采用"映射表 + 激活上下文 + 采样"模型

`core/input/InputMapper.ts` 提供引擎无关内核：调用方声明"输入上下文 → 输入源 → action"映射表；当前激活上下文决定哪些映射生效；输入源事件到达时在激活上下文下查表，命中且未被阻断则产出一条采样 `{ action, pressed, value, timestamp }`。内核提供 `setMappings`/`setActiveContext`/`replaceSource`/`dispose`。

**理由：** 直接对应 spec 的映射、上下文门控与采样三条需求；引擎无关便于 TDD；`InputSource` 可替换使真实设备与测试替身走同一订阅语义。
**未采用方案：** 事件总线式全局输入（会被业务散落监听且丢失上下文门控，与设计决策 10 冲突）。

### 2. 采样时间戳取自注入的单调时钟，内核不保证单调

采样时间戳直接读取注入的 `contracts/time/TimeSource`，不依赖 `Date.now()` 或 Cocos `deltaTime`。单调性由注入来源保证（建议注入 `MonotonicClock`），内核注释已声明该前提。

**理由：** 与既有时间分层一致，保证采样可测试、可复现；适配器只需把 Cocos 事件桥接到注入时钟。
**未采用方案：** 内核内置时钟（会脱离既有时间注入体系，且无法在测试中精确控制）。

### 3. UI/玩法阻断经"阻断判定回调"门控，默认消费导航模态状态

`InputMapperOptions` 提供 `navigator?: { readonly modal: boolean }` 与 `isBlocked?: () => boolean` 两个接缝：提供 `isBlocked` 时优先；否则有 navigator 时以其 `modal` 状态为阻断判定，模态生效时当前输入不派发 action。阻断判定每次事件动态求值，模态解除即恢复。

**理由：** ADR-010 预留的接缝直接消费，避免与导航状态双源漂移；内核只依赖 `modal` 布尔字段，不耦合 `UiNavigator` 具体实现。
**未采用方案：** 适配器内自行维护阻断布尔（会造成与导航状态双源漂移）。

### 4. Cocos 适配器为薄映射 + 引擎接缝，手柄缺失降级无输入

`adapters/cocos/input/CocosInputAdapter.ts` 实现 `InputSource` 订阅 `cc.input` 触摸/鼠标/键盘/手柄事件，翻译为内核可接收的 `InputEvent`；引擎 API（`input` 实例与事件类型）走可注入接缝。手柄缺失或未连接时降级为无输入而非报错；摇杆轴低于死区阈值视为中立。

**理由：** 与 `CocosSceneAdapter`/`CocosResourceProvider` 的接缝模式一致；手柄可用性随平台/浏览器差异大，v1 只覆盖"可用手柄"，缺失降级不引入多平台矩阵。
**未采用方案：** 在适配器内枚举完整手柄按钮/摇杆矩阵（v1 无真实数据支撑，属过度设计）。

### 5. sourceId 为字符串约定，action 标识为调用方定义的类型

适配器产出的 `InputSourceId` 约定：`touch:<touchId>`、`mouse:<button>`、`key:<keyCode>`、`gamepad:<deviceId>:<控件名>`（控件名如 `south`/`leftStickX`）。框架不枚举业务 action；`InputMapper` 以泛型 `TAction` 表达 action，仅保证类型一致与映射可配置。

**理由：** 设计决策 10 明确"具体项目定义 gameplay action 标识"；sourceId 字符串约定稳定、可测，调用方按约定配置映射即可。
**未采用方案：** 框架内置动作枚举或手柄控件矩阵（会把业务与平台细节灌入通用层）。

## 理由

- 输入内核模型决定后续所有输入能力（输入缓冲、优先级、招式识别、回放）的接入方式，属长期架构契约；一旦未来重构改变"映射表 + 激活上下文 + 采样"语义，各品类项目的行为预期会漂移而不被察觉。
- 阻断接缝以导航模态为唯一依据，是 UI/玩法双响应防护的落地前提；若改为适配器自维护阻断状态，会与导航双源漂移。
- sourceId 约定与 action 泛型是公开行为契约，影响后续适配器扩展与品类组合夹具。

## 影响

- 后续输入模块（如格斗输入缓冲、多手柄矩阵）必须复用 `InputMapper` 的 `InputSource`/`setActiveContext`/阻断接缝，不得另建重复输入总线。
- 新平台输入适配器必须遵循 `InputSource` 订阅语义与 sourceId 约定，缺失能力降级为无输入而非报错。
- 根入口 `index.ts` 已同步导出输入契约与内核符号（`expectedRootExports`），后续新增公开符号同样需同步白名单。
- 若出现需要"内置手柄控件矩阵"或"确定性回放输入"的场景，通过独立 change 扩展，不破坏当前内核契约。
