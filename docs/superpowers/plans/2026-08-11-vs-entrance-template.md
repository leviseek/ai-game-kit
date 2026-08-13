# VS 进场动画通用模板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 auto_battle 战场页战斗开始时先播放"左右双方队长武将 + VS 大字"进场动画（可参数化通用模板），播完再进入单位入场（3s 上浮淡入），presenter 三阶段串联。

**Architecture:** 新增 `view/vs-entrance.ts`（可参数化 VsEntranceTemplate，复用 EffectNode 契约与 TS 插值，禁 transition）；presenter 从"入场阶段"扩展为"VS 阶段 → 入场阶段 → 战斗阶段"三阶段状态机；VS 是纯表现层演示（不进事件流，确定性不受影响）；FGUI 节点委派 fgui-designer 产出。

**Tech Stack:** TypeScript strict、Bun、Cocos Creator 3.8.8、FairyGUI（FGUI）、OpenSpec change `unit-motion`（未归档，本计划作为其 tasks 扩展）。

## Global Constraints

- 注释使用简体中文，只解释意图/限制/权衡；标识符与 API 名保持英文。
- FGUI 组件创建/修改必须委派 fgui-designer；禁 `<graph>`；禁手写 transition（动画全 TS 驱动）；像素图经 `bun run fgui sprite` 生成且颜色 ⊆ `ui/demo/palette.json`；产出后 `bun run fgui validate --strict` 通过。
- 跨包引用只允许指向 Common/Common_xxx；导出组件名全局唯一。
- 战斗逻辑层确定性不回归：VS/入场阶段不推进 tick；同输入同结果可回放。
- 本计划实现于 change `unit-motion` 上下文（当前 21/22 完成，7.2 Cocos 待人工验证）。

---

### Task 1: VsEntranceTemplate 组件

**Files:**

- Create: `assets/samples/game_auto_battle/view/vs-entrance.ts`
- Test: `tests/framework/foundation/game-auto-battle-vs-entrance.test.ts`

**Interfaces:**

- Consumes: `EffectNode`（`assets/samples/game_auto_battle/view/effect-animator.ts` 导出：`setText?`/`setAlpha?`/`setXY?`）
- Produces: `VsEntranceConfig`、`VsEntranceHandle`、`createVsEntranceTemplate`（供 presenter 与测试使用）

- [ ] **Step 1: 写失败测试**

`tests/framework/foundation/game-auto-battle-vs-entrance.test.ts`：

```ts
import { describe, expect, test } from "bun:test";
import { createVsEntranceTemplate, type VsEntranceConfig } from "../../../assets/samples/game_auto_battle/view/vs-entrance";
import type { EffectNode } from "../../../assets/samples/game_auto_battle/view/effect-animator";

/** 记录型节点：记录 setter 写入。 */
interface RecordingNode extends EffectNode {
    readonly text: string | undefined;
    readonly alpha: number | undefined;
    readonly xy: { x: number; y: number } | undefined;
}

function recordNode(): RecordingNode {
    const recording: RecordingNode = {
        text: undefined,
        alpha: undefined,
        xy: undefined,
        setText: (v) => {
            recording.text = v;
        },
        setAlpha: (v) => {
            recording.alpha = v;
        },
        setXY: (x, y) => {
            recording.xy = { x, y };
        },
    };
    return recording;
}

function makeTime() {
    let now = 0;
    return {
        timeSource: () => now,
        advance: (ms: number) => {
            now += ms;
        },
    };
}

const DEFAULT_CONFIG: VsEntranceConfig = {
    left: { name: "敌方队长", sideLabel: "敌方" },
    right: { name: "己方队长", sideLabel: "己方" },
    durationMs: 1800,
    holdMs: 600,
    fadeMs: 300,
};

function makeTemplate(config: VsEntranceConfig = DEFAULT_CONFIG) {
    const nodes = new Map<string, RecordingNode>();
    const time = makeTime();
    const template = createVsEntranceTemplate({
        node: (name: string) => nodes.get(name),
        timeSource: time.timeSource,
        config,
    });
    const ensureNode = (name: string): RecordingNode => {
        let node = nodes.get(name);
        if (node === undefined) {
            node = recordNode();
            nodes.set(name, node);
        }
        return node;
    };
    return { template, nodes, ensureNode, advance: time.advance };
}

describe("Auto-battle VS entrance template", () => {
    test("play writes leader names to left/right nodes and VS badge", () => {
        const { template, ensureNode } = makeTemplate();
        template.play();
        expect(ensureNode("vs_left").text).toBe("敌方队长");
        expect(ensureNode("vs_right").text).toBe("己方队长");
        expect(ensureNode("vs_badge").text).toBe("VS");
    });

    test("leaders move from sides toward center then hold and fade out", () => {
        const { template, ensureNode, advance } = makeTemplate();
        const left = ensureNode("vs_left");
        const right = ensureNode("vs_right");
        template.play();

        // 起点：两侧偏移（vs_left 在左侧、vs_right 在右侧）
        expect(left.xy!.x).toBeLessThan(0);
        expect(right.xy!.x).toBeGreaterThan(0);

        // 中段：向中心移动
        advance(900);
        template.step();
        expect(left.xy!.x).toBeGreaterThan(-100);
        expect(right.xy!.x).toBeLessThan(100);

        // 结束后：整体淡出（alpha=0）、active 结束
        advance(1800 + 600 + 300);
        template.step();
        expect(left.alpha).toBe(0);
        expect(right.alpha).toBe(0);
        expect(template.active()).toBe(false);
    });

    test("vs badge fades in during play and fades out at end", () => {
        const { template, ensureNode, advance } = makeTemplate();
        const badge = ensureNode("vs_badge");
        template.play();
        expect(badge.alpha).toBe(0);
        advance(900);
        template.step();
        expect(badge.alpha!).toBeGreaterThan(0);
        advance(1800 + 600 + 300);
        template.step();
        expect(badge.alpha).toBe(0);
        expect(template.active()).toBe(false);
    });

    test("reset clears active state", () => {
        const { template, ensureNode } = makeTemplate();
        template.play();
        template.reset();
        expect(template.active()).toBe(false);
        expect(ensureNode("vs_left").alpha).toBe(0);
    });

    test("duration is configurable", () => {
        const { template, ensureNode, advance } = makeTemplate({
            ...DEFAULT_CONFIG,
            durationMs: 3000,
            holdMs: 1000,
            fadeMs: 500,
        });
        const left = ensureNode("vs_left");
        template.play();
        advance(2000);
        template.step();
        expect(left.alpha!).toBeGreaterThan(0);
        advance(3000 + 1000 + 500);
        template.step();
        expect(left.alpha).toBe(0);
        expect(template.active()).toBe(false);
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test ./tests/framework/foundation/game-auto-battle-vs-entrance.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 VsEntranceTemplate**

`assets/samples/game_auto_battle/view/vs-entrance.ts`：

```ts
import type { EffectNode } from "./effect-animator";

/** VS 进场配置：左右双方队长武将名 + 动画时长（参数化，供定制）。 */
export interface VsEntranceConfig {
    /** 左侧（敌方）武将信息。 */
    readonly left: { readonly name: string; readonly sideLabel: string };
    /** 右侧（己方）武将信息。 */
    readonly right: { readonly name: string; readonly sideLabel: string };
    /** VS 展示总时长（ms，入场+定格，不含淡出）。 */
    readonly durationMs: number;
    /** 定格时长（ms）。 */
    readonly holdMs: number;
    /** 淡出时长（ms）。 */
    readonly fadeMs: number;
}

/** VS 进场句柄：驱动节点动画；时间源注入保证测试可控。 */
export interface VsEntranceHandle {
    /** 开始 VS 动画：写入武将名/VS 文本并初始化两侧偏移。 */
    play(): void;
    /** 按当前时间推进插值；结束后整体淡出（alpha=0）。 */
    step(): void;
    /** 是否进行中。 */
    active(): boolean;
    /** 清空并回终态（restart/退出）。 */
    reset(): void;
}

/** VS 屏幕级覆盖层：左右武将从屏外两侧向中心入场，中间 VS 大字淡入定格，整体淡出。 */
export function createVsEntranceTemplate(options: { node: (name: string) => EffectNode | undefined; timeSource: () => number; config: VsEntranceConfig }): VsEntranceHandle {
    const { node, timeSource, config } = options;
    // 左右武将屏外起始偏移：left 在屏幕左侧外、right 在右侧外（向中心 x=0 收敛）
    const SIDE_OFFSET = 640;
    const CENTER_X = 0;
    const CENTER_Y = 0;

    let started = false;
    let playStart = 0;
    let playEnd = 0;
    let fadeStart = 0;
    let fadeEnd = 0;

    function resolve(name: string): EffectNode | undefined {
        return node(name);
    }

    function writeXY(name: string, x: number, y: number): void {
        resolve(name)?.setXY?.(x, y);
    }

    function writeAlpha(name: string, value: number): void {
        const view = resolve(name);
        if (view?.setAlpha !== undefined) {
            view.setAlpha(Math.min(1, Math.max(0, value)));
        }
    }

    function writeText(name: string, value: string): void {
        resolve(name)?.setText?.(value);
    }

    function clamp01(v: number): number {
        return Math.min(1, Math.max(0, v));
    }

    return {
        play() {
            const now = timeSource();
            started = true;
            playStart = now;
            playEnd = now + config.durationMs;
            fadeStart = playEnd;
            fadeEnd = playEnd + config.fadeMs;

            writeText("vs_left", config.left.name);
            writeText("vs_right", config.right.name);
            writeText("vs_badge", "VS");
            // 起点：两侧屏外偏移、alpha 0（VS 大字淡入、武将随移动入场）
            writeXY("vs_left", -SIDE_OFFSET, CENTER_Y);
            writeXY("vs_right", SIDE_OFFSET, CENTER_Y);
            writeAlpha("vs_left", 0);
            writeAlpha("vs_right", 0);
            writeAlpha("vs_badge", 0);
        },
        step() {
            if (!started) {
                return;
            }
            const now = timeSource();
            if (now < playStart) {
                return;
            }
            if (now >= fadeEnd) {
                // 整体淡出结束：终态 alpha=0、active 结束
                writeAlpha("vs_left", 0);
                writeAlpha("vs_right", 0);
                writeAlpha("vs_badge", 0);
                started = false;
                return;
            }
            // 入场阶段：武将从两侧向中心 + 淡入，VS 大字淡入
            const entranceProgress = clamp01((now - playStart) / config.durationMs);
            const leftX = -SIDE_OFFSET * (1 - entranceProgress);
            const rightX = SIDE_OFFSET * (1 - entranceProgress);
            writeXY("vs_left", leftX, CENTER_Y);
            writeXY("vs_right", rightX, CENTER_Y);
            writeAlpha("vs_left", entranceProgress);
            writeAlpha("vs_right", entranceProgress);
            writeAlpha("vs_badge", entranceProgress);
            // 定格：入场结束后保持到 fadeStart（无额外写入）
            if (now >= fadeStart) {
                // 淡出：alpha 线性降到 0
                const fadeProgress = clamp01((now - fadeStart) / config.fadeMs);
                writeAlpha("vs_left", 1 - fadeProgress);
                writeAlpha("vs_right", 1 - fadeProgress);
                writeAlpha("vs_badge", 1 - fadeProgress);
            }
        },
        active() {
            return started;
        },
        reset() {
            writeAlpha("vs_left", 0);
            writeAlpha("vs_right", 0);
            writeAlpha("vs_badge", 0);
            started = false;
        },
    };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test ./tests/framework/foundation/game-auto-battle-vs-entrance.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: 提交**

```bash
git add tests/framework/foundation/game-auto-battle-vs-entrance.test.ts assets/samples/game_auto_battle/view/vs-entrance.ts
git commit -m "feat(auto-battle): VS 进场通用模板（左右武将 + VS 大字，参数化）"
```

---

### Task 2: presenter 三阶段状态机

**Files:**

- Modify: `assets/samples/game_auto_battle/view/presenter.ts`
- Modify: `assets/samples/game_auto_battle/assembly.ts`
- Test: `tests/framework/foundation/game-auto-battle-presenter.test.ts`

**Interfaces:**

- Consumes: `createVsEntranceTemplate` / `VsEntranceConfig`（Task 1）；`autoBattle.battle.state.units`（选队长：每方 index 最小存活单位）；`createEffectAnimator`（既有）
- Produces: presenter 三阶段（`vs → entrance → fighting`）；`restart` 重置回 vs

- [ ] **Step 1: 写失败测试**

在 `tests/framework/foundation/game-auto-battle-presenter.test.ts` 追加：

```ts
test("presenter runs VS phase before entrance and fighting (phases)", async () => {
    const createAutoBattleFixture = await loadCreateAutoBattleFixture();
    const fixture = createAutoBattleFixture({ configContent: battleContent() });
    await fixture.start();
    const view = recordingView();
    const presenter = createAutoBattlePresenter(fixture, view.node);

    // VS 阶段：VS 节点已写入队长名（每方 index 最小存活单位）
    // 注意 presenter 用 Date.now() 驱动，此测试只验证初始渲染即进入 VS 阶段
    expect(view.nodes.get("vs_left")?.text).toBe("e"); // 敌方唯一单位 e
    expect(view.nodes.get("vs_right")?.text).toBe("a"); // 己方 index 0 → a
    expect(view.nodes.get("vs_badge")?.text).toBe("VS");

    presenter.dispose();
    await fixture.dispose();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test ./tests/framework/foundation/game-auto-battle-presenter.test.ts`
Expected: FAIL（vs_left 节点未写入——presenter 尚无 VS 阶段）

- [ ] **Step 3: 实现 presenter 三阶段**

`assets/samples/game_auto_battle/view/presenter.ts`：

```ts
// 顶部常量
const VS_PHASE_MS = 1800;
const ENTRANCE_PHASE_MS = 3000; // 既有

// createAutoBattlePresenter 内：
// 阶段类型与状态
type PresenterPhase = "vs" | "entrance" | "fighting";
let phase: PresenterPhase = "vs";
const vsStart = Date.now();
const vsEnd = vsStart + VS_PHASE_MS;
const entranceEnd = vsEnd + ENTRANCE_PHASE_MS; // 既有 entranceEnd 语义改为相对 vsEnd

// 选择每方队长：index 最小存活单位
function leaderOf(side: "ally" | "enemy"): string {
    const units = autoBattle.battle.state.units.filter((u) => u.side === side && u.hp > 0);
    if (units.length === 0) {
        return "";
    }
    return units.sort((a, b) => a.index - b.index)[0]!.name;
}

const vsTemplate = createVsEntranceTemplate({
    node: (name: string) => node(name),
    timeSource: () => Date.now(),
    config: {
        left: { name: leaderOf("enemy"), sideLabel: "敌方" },
        right: { name: leaderOf("ally"), sideLabel: "己方" },
        durationMs: VS_PHASE_MS,
        holdMs: 600,
        fadeMs: 300,
    },
});
vsTemplate.play();
```

interval 循环改为按 phase 分发：

```ts
timer = setInterval(() => {
    const now = Date.now();
    if (phase === "vs") {
        render();
        vsTemplate.step();
        if (now >= vsEnd) {
            phase = "entrance";
        }
        return;
    }
    if (phase === "entrance") {
        render();
        stepEffects(); // 推进单位入场动画
        if (now >= entranceEnd) {
            phase = "fighting";
        }
        return;
    }
    // fighting：既有逻辑
    autoBattle.clock.advance((now - lastTick) * autoBattle.getSpeed());
    lastTick = now;
    if (autoBattle.battle.state.phase === "fighting") {
        for (let index = 0; index < autoBattle.getSpeed(); index += 1) {
            autoBattle.battle.tick();
        }
    }
    render();
    stepEffects();
}, 100);
```

`restart` 命令改为重置回 vs 阶段：

```ts
restart: () => {
    autoBattle.battle.restart();
    effectCursor = -1;
    effectAnimator.reset();
    vsTemplate.reset();
    phase = "vs";
    vsTemplate.play();
    render();
},
```

`dispose` 追加 `vsTemplate.reset()`。

`assets/samples/game_auto_battle/assembly.ts`：无需改（presenter 内自建 vsTemplate，节点解析复用 presenter 的 node）。

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test ./tests/framework/foundation/game-auto-battle-presenter.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add assets/samples/game_auto_battle/view/presenter.ts tests/framework/foundation/game-auto-battle-presenter.test.ts
git commit -m "feat(auto-battle): presenter VS→入场→战斗三阶段串联"
```

---

### Task 3: FGUI VS 节点（委派 fgui-designer）

**Files:**

- Create（fgui-designer 产出）: `ui/demo/assets/AutoBattle/VsEntranceCom.xml`、`ui/demo/assets/AutoBattle/img/*`（VS 大字/遮罩像素图）、`ui/demo/assets/AutoBattle/package.xml` 登记
- Modify: `ui/demo/assets/AutoBattle/AutoBattleView.xml`（加入 `container_vs` 或直接预置 VS 节点组）

**Interfaces:**

- Produces: FGUI 节点 `vs_left`/`vs_right`/`vs_badge`/`vs_mask`（presenter 经 node(name) 寻址）

- [ ] **Step 1: 委派 fgui-designer 产出节点**

Prompt fgui-designer：在 AutoBattle 包新建 `VsEntranceCom` 组件，内含 `vs_left`（左侧武将名文本）、`vs_right`（右侧武将名文本）、`vs_badge`（"VS" 大字文本，可加像素底图）、可选 `vs_mask` 半透明遮罩；像素图经 `bun run fgui sprite` 生成（palette 锁定）；产出后 `bun run fgui validate --strict` 通过。约束：禁 graph、禁 transition（动画由 TS 驱动）、资源 id 续编、导出组件名唯一。在 AutoBattleView.xml 预置 VS 节点组（或 container_vs 容器，presenter 经 node 寻址）。

- [ ] **Step 2: 验证节点可寻址**

Run: `bun run fgui list-resources --package AutoBattle --project ui/demo`
Expected: `VsEntranceCom` 与相关像素资源已登记；`bun run fgui validate --package AutoBattle --strict` 通过

- [ ] **Step 3: 编辑器发布 AutoBattle 包**

在 FGUI 编辑器发布 `AutoBattle` 包（产物 bin/atlas 随源提交），`fgui check-publish` 核对。

- [ ] **Step 4: 提交**

```bash
git add ui/demo/assets/AutoBattle/ assets/ui/AutoBattle/
git commit -m "feat(fgui): AutoBattle VS 进场节点（VsEntranceCom + 像素资源）"
```

---

### Task 4: 集成验证与回归

**Files:**

- Test: `tests/framework/foundation/game-auto-battle-vs-entrance.test.ts`、`game-auto-battle-presenter.test.ts`

- [ ] **Step 1: 全量测试回归**

Run: `bun test`
Expected: 全绿（VS 纯表现层，逻辑层确定性不回归）

- [ ] **Step 2: typecheck + lint**

Run: `bun run typecheck:ci && bun run lint`
Expected: 通过

- [ ] **Step 3: 注释一致性检查**

grep `ENTRANCE_PHASE_MS`/`vs`/`入场`：presenter 注释反映三阶段；无陈旧"单阶段入场"表述。

- [ ] **Step 4: 提交（如 1-3 有未提交改动）**

```bash
git add -A
git commit -m "test(auto-battle): VS 进场与三阶段回归验证"
```

- [ ] **Step 5: 更新 unit-motion tasks.md**

在 `openspec/changes/unit-motion/tasks.md` 追加/更新：记录 VS 进场模板（Task 1-3 对应项）与 3s 入场时长调整；7.2 待人工 Cocos 验证改为含 VS 表现确认。

---

### Task 5: Cocos 人工验证（7.2 收尾）

**Files:** 无代码改动（人工验证）

- [ ] **Step 1: Cocos 预览 `?smoke=auto-battle`**

人工在 Cocos 编辑器验证：战斗开始先播放 VS（左右武将 + VS 大字，约 1.8s）→ 单位入场（3s 上浮淡入）→ 自动对战；终局结果与事件序列确定性不回归；restart 重置回 VS。

- [ ] **Step 2: 更新 unit-motion tasks.md 7.2 勾选**

人工确认后把 7.2 标记完成。
