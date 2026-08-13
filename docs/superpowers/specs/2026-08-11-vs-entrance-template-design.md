# VS 进场动画通用模板设计

> 状态：设计提案（brainstorming 产出）
> 关联：openspec change `unit-motion`（入场阶段化）、ADR-027（事件驱动表现层）
> 适用范围：`assets/samples/game_auto_battle/view/`（auto_battle 内通用组件）

## 1. 背景与目标

`unit-motion` change 已实现单位入场（3 秒上浮淡入到位，presenter 入场阶段不推进战斗）。用户希望入场更富表现力：战斗开始先展示**左右双方队长武将 VS 进场动画**（通用模板），播完再进入单位入场，两段串联。

### 已确认决策

- **队长** = 每方首个存活单位（或 config 标记的队长 hero，优先每方 index 最小存活单位）
- **内容**：左侧敌方队长 + 右侧己方队长 + 中间 VS 大字；双方从两侧向中心入场后定格，播完整体淡出
- **层级**：auto_battle `view/` 内可参数化通用组件（其它品类可复制模式）
- **衔接**：VS 先播（约 1.5-2s）→ 单位入场（3s 上浮淡入）串联
- **阶段**：presenter 三阶段 `VS 阶段 → 入场阶段 → 战斗`

### 非目标

- 不做独立 VS 前置场景/页面（VS 叠加战斗页，播完淡出露出战斗）
- 不做复杂序列帧光效/粒子（沿用 D4：像素风 + TS 驱动）
- 不做跨品类 framework 抽象（先 auto_battle 内，模式可复制）
- 不用 FGUI transition（AGENTS 第 10 条：动画全 TS 驱动）

## 2. 架构

```
presenter（三阶段状态机）
  ├── VS 阶段（~1.8s）：VsEntranceTemplate.play() → 左右武将两侧入中 + VS 大字 + 定格淡出
  ├── 入场阶段（3s）：现有 entrance 动画（单位上浮淡入）——已实现
  └── 战斗阶段：正常 tick 驱动 + 命中反馈/位移动画
```

### 2.1 `view/vs-entrance.ts`（新）：VsEntranceTemplate 通用组件

```ts
export interface VsEntranceConfig {
    readonly left: { readonly name: string; readonly sideLabel: string }; // 敌方（左）
    readonly right: { readonly name: string; readonly sideLabel: string }; // 己方（右）
    readonly durationMs: number; // VS 展示总时长（默认 1800）
    readonly holdMs: number; // 定格时长（默认 600）
    readonly fadeMs: number; // 淡出时长（默认 300）
}

export interface VsEntranceHandle {
    play(): void; // 开始 VS 动画
    step(): void; // 每帧推进（时间源注入）
    active(): boolean; // 是否进行中
    reset(): void; // 清空（restart/退出）
}

export function createVsEntranceTemplate(options: {
    node: (name: string) => EffectNode | undefined; // 复用 EffectNode 契约
    timeSource: () => number;
    config: VsEntranceConfig;
}): VsEntranceHandle;
```

- **节点名约定**：`vs_left`（左侧武将容器/文本）、`vs_right`（右侧）、`vs_badge`（VS 大字）、`vs_mask`（半透明遮罩，可选）。FGUI 预置在 AutoBattle 包（新组件 `VsEntranceCom`），像素资源 palette 锁定。
- **动画流程**：left/right 从两侧（屏外偏移）向中心插值入场 → `vs_badge` 淡入/放大定格 → hold → 整体淡出（alpha→0）。
- **参数化**：武将名/坐标偏移/时长/文本可配，供后续定制不同 VS 效果。
- 复用 `EffectNode`（setXY/setAlpha/setText）与 `gridToXY` 无关（VS 是屏幕级覆盖层）。

### 2.2 presenter 三阶段

```ts
type PresenterPhase = "vs" | "entrance" | "fighting";
let phase: PresenterPhase = "vs";
let phaseEnd = Date.now() + VS_PHASE_MS; // VS ~1800ms
```

- interval 循环按 phase 分发：
    - `vs`：`vsTemplate.play()` + `step()`；到 `phaseEnd` 切 `entrance`，`vsTemplate` 淡出结束
    - `entrance`：现有逻辑（推进 entrance 动画，不 tick）；到 `entranceEnd` 切 `fighting`
    - `fighting`：正常 tick + 渲染 + 特效
- `restart`：重置为 `vs` 阶段，`vsTemplate.reset()` + `effectAnimator.reset()` + 投影游标重置
- VS 阶段**不 tick 战斗**（与入场阶段一致），逻辑层确定性与 smoke 手动 tick 路径不受影响

### 2.3 投影/数据流

- `round-start` 首轮事件 → presenter 读取 `state.units` 选每方队长（index 最小存活）→ 配置 `VsEntranceConfig`（武将名）→ `vsTemplate.play()`
- VS 动画不产生新事件、不进事件流（纯表现层演示，同 ADR-027 动画器定位）

### 2.4 FGUI（委派 fgui-designer）

- 新组件 `VsEntranceCom`（AutoBattle 包）：`vs_left`/`vs_right` 文本（或画像占位）、`vs_badge` 文本（"VS"）、可选 `vs_mask` 遮罩
- 像素资源（VS 大字/遮罩）经 `bun run fgui sprite` 生成，palette 锁定；产出后 `bun run fgui validate --strict`
- 发布产物由编辑器生成

## 3. 测试

- `VsEntranceTemplate` 单元测试（时间源注入）：左右武将两侧入中插值、VS 大字淡入/定格、整体淡出、终态 alpha=0、`active()` 生命周期、参数化生效
- presenter 阶段测试：`vs → entrance → fighting` 三阶段时序（时间源注入）；`restart` 重置回 vs；VS 阶段不 tick（战斗事件数不变）
- 确定性：VS 纯表现层，既有回放一致性测试不回归

## 4. 风险

- [VS 阶段延长开战等待] → VS 仅 ~1.8s，且只影响 presenter 真实运行；可参数化 `durationMs` 调整
- [队长选取歧义] → 明确"每方 index 最小存活单位"；config 可选 `isLeader` 标记覆盖（预留，首版可不实现）
- [FGUI 新组件引入资源负担] → VS 大字/遮罩像素图 palette 锁定、最小化；委派 fgui-designer 保证 validate

## 5. 落地方式

- 本设计作为 unit-motion change 的**扩展任务**纳入（VS 阶段是入场阶段化的演进），或独立小 change。倾向：作为 unit-motion 的 tasks 扩展（vs-entrance.ts + presenter 三阶段 + FGUI 委派 + 测试），一次归档。
