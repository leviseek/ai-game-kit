## Context

framework core/time 已有 `SimulationClock`（advance/rate/pause 单层，`assets/framework/core/time/SimulationClock.ts`）、`WallClock`、`MonotonicClock`，契约 `TimeSource { now(): number }`。品类动画（`effect-animator` / `vs-entrance`）是纯 TS 声明式 + 注入 timeSource（presenter 用 Date.now、测试用自增源）。ADR-029 确立：三时间域（模拟/墙钟/表现），`GameClock` 是表现时间唯一控制点，动画器零感知，装饰动画也跟 rate，分层 pause（menu ⊃ combat，menu 暂停不冻结 combat），应用级 pause 冻结全部域，不引入引擎动画桥。见 proposal.md - Why 与 ADR-029。

## Goals / Non-Goals

**Goals:**

- `GameClock`：全局 rate、分层 pause（PauseDomain menu/combat）、advance、jumpTo、应用级冻结；纯 TS 可测。
- `MotionTween` 契约：timeSource 必填（禁默认 Date.now），动画器零感知。
- 动画器/挡位接入 GameClock（替换 Date.now 散落驱动）。
- ADR-029 创建；AGENTS/.ai 动画约束补充。

**Non-Goals:**

- 不引入引擎动画桥（GTween/Transition/GMovieClip）——装饰/行为动画均 TS 驱动。
- 不改造 `SimulationClock` 语义（保持纯净离散，不 jumpTo）；`WallClock` 不变。
- 不做动画器迁移到新运行时（effect-animator 已满足"零感知"模式，仅换注入源）。
- 不做 3x 装饰动画可读性 spike 的结论性实现（C-13/C-19 上限值留待 spike 定稿，本 change 落 `MAX_DECOR_RATE` 常量与文档，默认 2）。

## Decisions

### 决策 1：`GameClock` 结构（对齐 SimulationClock 模式 + 分层 pause + jumpTo）

`assets/framework/core/time/GameClock.ts`：

```ts
export enum PauseDomain {
    Menu = "menu",
    Combat = "combat",
}

export interface GameClockOptions {
    readonly initialTime?: number;
    readonly timeScale?: number; // 默认 1
}

export class GameClock implements TimeSource {
    // 每域独立暂停计数（resume 只解除本域 pause）；menu ⊃ combat 层级表达为：
    // combat 冻结当且仅当 combat 或 Menu 域被 pause（menu 冻结不冻结 combat，见决策 3）
    private domainPaused: Record<PauseDomain, boolean>;
    private rate: number;
    private currentTime: number;

    now(domain: PauseDomain = PauseDomain.Combat): number;
    get timeScale(): number;
    setTimeScale(rate: number): void; // isValidRate 校验（对齐 SimulationClock）
    pause(domain: PauseDomain): void;
    resume(domain: PauseDomain): void;
    advance(milliseconds: number): void; // 只推进未冻结域（记录各域上次推进，语义见决策 2）
    jumpTo(time: number): void;
    // 应用级暂停：全部域冻结
    freezeAll(): void; // 或内部 freeze 标志 = 全部域 pause
    thawAll(): void;
}
```

- 对齐 `SimulationClock` 的 rate 校验（有限正数）、pause/resume 计数语义。
- `now(domain)` 返回 currentTime，但**各域冻结时读数保持**——实现：每域维护 `lastNow`（该域冻结时刻读数），advance 只更新未冻结域。或用"baseTime + elapsedPerDomain"模型：每个域独立累计已推进量。

**推荐实现（per-domain elapsed）**：

```ts
// 每域 elapsed（已推进量）与 paused 标志；currentTime 由未冻结域共享推进
advance(ms): for each domain, if not paused, domainElapsed[domain] += ms * rate;
now(domain): return baseTime + domainElapsed[domain];  // jumpTo 调 baseTime
```

- 说明：各域共享 baseTime（jumpTo 统一跳），elapsed 分域累计；暂停域 elapsed 不增 → now 冻结；未暂停域正常推进。
- 应用级暂停 = 全部 domainPaused = true（freezeAll 置位所有域）。

理由：per-domain elapsed 简单、可测、支持 menu 冻结不冻结 combat（menu 暂停只影响 Menu 域 elapsed）。

### 决策 2：menu ⊃ combat 层级语义

- **menu 暂停不冻结 combat**：`pause(Menu)` 只冻结 Menu 域；`now(Combat)` 继续推进。
- **combat 暂停冻结 combat**：`pause(Combat)` 冻结 Combat 域。
- **应用级暂停冻结全部**：freezeAll 置位 Menu+Combat，thawAll 复位。
- 层级"menu ⊃ combat"在本设计中体现为：**menu 暂停时战斗表现继续**（业务决策，ADR-029 C-14）。若未来需要"上层冻结下层"（menu 暂停也冻结 combat），扩展 now 判定即可（Menu pause 时 Combat 也冻结），当前不实现。

理由：业务确认"悬浮菜单时战斗背景仍动"，menu 是独立暂停域；per-domain elapsed 天然支持该语义。

### 决策 3：`MotionTween` 契约与动画器零感知

`assets/framework/contracts/time/MotionTween.ts`：

```ts
/** 声明式动画契约：timeSource 必填，动画器只读 now(domain)，不自行乘 rate/判跳变。 */
export interface MotionTweenOptions {
    readonly timeSource: TimeSource; // 必填；禁默认 Date.now
    readonly domain?: PauseDomain; // 默认 Combat（行为/装饰动画绑战斗域）
    readonly durationMs: number;
    readonly onStep: (progress: number, now: number) => void;
    readonly onComplete?: () => void;
}
```

- 动画器（effect-animator / vs-entrance）的 timeSource 改注入 GameClock；动画器内 `progress = (now - start)/(end - start)` 保持（零感知）。
- `PauseDomain` 从 core/time 导出，contracts 引用（不循环依赖：contracts 定义枚举或从 core 导入类型）。

理由：契约层定义动画声明式接口，core 提供 GameClock 实现；动画器保持"按注入时间插值"单一职责（C-20）。

### 决策 4：presenter 挡位收敛

- presenter 创建 `GameClock`（rate 初始 1），`autoBattle.clock`（SimulationClock）的 advance 改由 GameClock delta 驱动：
    - interval 每帧：`delta = gameClock.now() - lastGameNow`；`simulationClock.advance(delta)`；tick 仍按模拟钟节拍（或挡位换算保留）。
    - `cycleSpeed` → `gameClock.setTimeScale(speed)`（替代 clock.setTimeScale + 每 interval 推多次）。
- 装饰动画跟 rate：effect-animator timeSource = GameClock（`now(Combat)`），3x 时真实时长 = 基准/3；`MAX_DECOR_RATE` 常量（默认 2）供 spike 后启用（本 change 落常量，默认不 clamp 或 clamp 2 待定——建议先全跟，C-19 标注）。

理由：ADR-029 C-08/C-13；收敛挡位到 GameClock.rate，动画与战斗同步响应倍速。

### 决策 5：public-boundary 白名单与导出

- `assets/framework/index.ts` 导出 `GameClock` / `PauseDomain` / `MotionTween`（及相关类型）。
- `tests/framework/foundation/public-boundary.test.ts` 的 `expectedRootExports` 同步新增（负向测试精确锁定，漏更即红）。
- 新增导出仅限 framework 根入口（游戏层禁深层导入，既有约束）。

理由：framework 公共 API 面受负向测试保护，任何新导出必须显式登记。

### 决策 6：ADR-029 与 AGENTS 约束

- 创建 `doc/decisions/ADR-029-global-time-control-animation-time-source.md`（含 C-01~~C-20，本 change 落地 C-05/C-08/C-10~~C-14/C-17/C-19/C-20 相关决策，其余为基线）。
- AGENTS/.ai 补充："动画优先用 framework 动画 API 与 GameClock；游戏层禁直接 import cc 做 tween；FGUI 禁 transition 不变"。

理由：架构决策落档 + AI 协作约束沉淀。

## Risks / Trade-offs

- [GameClock per-domain elapsed 与 SimulationClock 驱动关系复杂] → 保持双轨（GameClock 连续、SimulationClock 离散 tick）；presenter 只做 delta 换算，逻辑层仍读 SimulationClock。
- [装饰动画 3x 可读性（40ms 闪白）] → C-19 `MAX_DECOR_RATE` 默认 2（常量落地，spike 后定是否 clamp）；本 change 标注待定。
- [动画器换注入源引入回归] → 动画器逻辑零改动（仅 timeSource 参数），既有动画器测试换注入源后全量回归；新增 GameClock 单测锁定 rate/pause 分层/jumpTo。
- [public-boundary 白名单漏更] → 显式任务项，新增导出后跑 public-boundary.test.ts 确认绿。
- [menu/combat 域语义误用] → PauseDomain 枚举 + spec 场景锁定"menu 暂停不冻结 combat"。

## Migration Plan

1. core/time：`GameClock.ts` + `PauseDomain` + 单测。
2. contracts/time：`MotionTween.ts` 契约。
3. framework index 导出 + public-boundary 白名单同步。
4. 动画接入：effect-animator / vs-entrance 注入 GameClock（presenter 创建、测试注入自增源）。
5. presenter 挡位收敛到 GameClock.rate。
6. ADR-029 创建；AGENTS/.ai 补充。
7. 全量回归（bun test / typecheck / lint / public-boundary）。

回滚：revert 各提交；动画器恢复 Date.now 注入（行为回现状）。

## Open Questions

- `MAX_DECOR_RATE` 是否默认 clamp 到 2（3x 装饰动画可读性 spike 结论）？
- GameClock 连续推进驱动源：Cocos `director.on(EVENT_AFTER_UPDATE)` 注入 dt vs 自有被动调度器？（本 change 先用外部 advance 驱动，适配层留待 Cocos 环境接入。）
