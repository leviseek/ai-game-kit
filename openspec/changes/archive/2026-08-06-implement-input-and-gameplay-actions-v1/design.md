# Implement Input And Gameplay Actions v1 — Design

## Context

框架已具备分层模式：`contracts/*`（纯接口与类型化错误）、`core/*`（引擎无关实现）、`adapters/memory/*` 与 `adapters/cocos/*`（注入接缝）、`tests/framework/foundation/*.test.ts`（bun）。`ui-navigation` 的 `UiNavigator` 已实现 modal 推导（ADR-010 影响段明确"输入上下文阻断（6.4-6.5）必须以导航模态状态为 UI 侧阻断依据"），6.3 归档遗留项把"导航 modal 自动同步"划入本 change 范围。FairyGUI 侧已有独立的 UI 事件通道（View→ViewModel），本 change 只负责 Cocos gameplay action 输入，两者按设计决策 10 分流。

## Goals / Non-Goals

**Goals:**

- 提供引擎无关的输入内核：action 映射、上下文切换、采样（状态/值/单调时间戳）、输入源可替换
- Cocos 输入适配器：触摸/鼠标/键盘/可用手柄 → action 的薄映射，遵循引擎接缝可注入 mock 模式
- UI/玩法阻断：消费 `UiNavigator` 模态状态，模态时玩法上下文不响应
- 严格类型化，内核不依赖 `cc`，根入口白名单同步

**Non-Goals:**

- 不把 FairyGUI UI 事件包装成全局输入总线（设计决策 10：UI 输入走 View→ViewModel）
- 不在框架定义固定业务动作（"攻击""出牌"等属 `game` 层）
- 不实现输入缓冲、优先级、招式识别或回放（属格斗后续模块）
- 不实现联网输入或防作弊

## Decisions

### 1. 输入内核采用"映射表 + 激活上下文 + 采样"模型

内核提供 `InputMapper`/`InputContext` 概念：调用方声明底层输入到 action 的映射表；当前激活上下文决定哪些映射生效；每次输入事件在激活上下文下产出一条采样 `{ action, pressed, value, timestamp }`。

- **理由**：直接对应 spec 的映射、上下文门控与采样三条需求；引擎无关，便于 TDD。
- **备选**：事件总线式全局输入。会被业务散落监听且丢失上下文门控，与设计决策 10 冲突。

### 2. 时间戳使用注入的单调时钟

采样时间戳取自注入的时间来源（复用 `contracts/time/TimeSource` 的 monotonic 语义），不依赖 `Date.now()` 或 Cocos `deltaTime`。

- **理由**：保证采样可测试且可复现；与既有时间分层一致。
- **权衡**：适配器需要把 Cocos 事件时间或本地时钟桥接到注入来源，桥接逻辑集中在适配器。

### 3. UI 阻断通过导航模态状态门控

适配器或内核接收一个"阻断判定"回调，默认读取 `UiNavigator` 的模态状态（`hasModal` 或等价可观测），模态生效时玩法上下文不派发 action。

- **理由**：ADR-010 已预留该接缝，直接消费比另建重复的阻断状态更符合既有架构。
- **备选**：适配器内自行维护阻断布尔。会造成与导航状态双源漂移。

### 4. Cocos 适配器为薄映射 + 引擎接缝

`adapters/cocos/input/CocosInputAdapter.ts` 订阅 `cc.input` 触摸/鼠标/键盘/手柄事件，翻译为内核可接收的底层输入事件；引擎 API 通过可注入接缝访问，便于测试替身替换。

- **理由**：与 `CocosSceneAdapter`/`CocosResourceProvider` 的既有接缝模式一致。
- **权衡**：手柄可用性随平台/浏览器差异大，v1 只覆盖"可用手柄"，缺失或未连接手柄降级为无输入而非报错。

### 5. 无业务动作名，action 标识为调用方定义的类型

框架不枚举业务动作；action 以调用方定义的字符串/枚举类型表达，仅保证类型一致与映射可配置。

- **理由**：设计决策 10 明确"具体项目定义 gameplay action 标识"。

## Risks / Trade-offs

- [UI 与玩法同时消费同一输入] → 以导航模态为阻断依据，并用双响应测试断言单次采样；阻断解除后恢复响应。
- [FairyGUI 事件与 Cocos 输入重复处理] → 明确分流边界：UI 输入不进本通道；测试锁定互不穿透。
- [手柄映射平台差异] → 适配器只覆盖可用手柄，不可用降级为无输入并记录结构化诊断，不引入多平台矩阵。
- [上下文切换时序竞争] → 切换立即生效且不残留采样，测试覆盖切换瞬时输入的归属。

## Migration Plan

无存量迁移。实现顺序为 TDD：先写 `tests/framework/foundation/input.test.ts` 覆盖 spec 场景（红期），再实现 `contracts/input/*` 与 `core/input/*` 至转绿；随后实现 Cocos 适配器与双响应集成测试；最后同步根入口白名单。归档前执行 ADR 检查。

## Open Questions

无。映射形状、阻断来源与适配器接缝已在 Decisions 落定，不改变 spec 行为契约。
