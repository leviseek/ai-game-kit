# LineupEditorView 编队页 9 槽全可用 + 候选英雄 GList 虚拟列表 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复编队页两个缺陷——布阵区 9 格全部可操作（但上阵上限保持 6）、候选英雄区改为 GList 虚拟列表（动态数量），并同步迁移编队存档 schema v1→v2。

**Architecture:** 逻辑层把 `AutoBattleLineup.slots` 定长从 `MAX_TEAM_SIZE`(6) 改为 `FORMATION_GRID_SIZE`(9)，reducer 增加"非空数 ≤ 6"上限约束；存档 v1→v2 迁移补齐 9 长度。视图层槽位绑定循环扩到 9，删除候选预置绑定；候选区新增引擎无关 `FairyGuiListHandle` 契约（`contracts/ui/List.ts`）+ cocos 适配层实现（对齐 `DynamicComponentViewHandle` 先例），boot 对 LineupEditorView 装配列表句柄，presenter 在 render 时 `setItems(vm.candidates)`。

**Tech Stack:** TypeScript(strict)、Bun、Cocos Creator 3.8.8、FairyGUI CocosCreator 5.0 源 XML、FGUI CLI。

## Global Constraints

- 注释用简体中文，只解释意图/限制/权衡；标识符与 API 名保持英文。
- `MAX_TEAM_SIZE=6` 保持为上阵上限（`logic/config.ts` 不改）；`FORMATION_GRID_SIZE=9` 为布阵区容量（`logic/grid.ts` 已有）。
- 战斗规模仍为 1v1..6v6；战场 MapGrid 网格、敌左己右、动态实例化 UnitSlot 均不动。
- fgui 类型不出适配层边界（design decision 7）；渲染器与游戏层只消费 `ViewModelNode` 契约。
- 不主动 git 提交；每任务以验证命令通过为完成标准（项目约定：仅用户明确要求时提交）。
- FGUI 组件创建/编辑委派 fgui-designer，不主会话手写 XML；`bun run fgui validate --strict` 通过；发布产物由编辑器生成（不手改 bin/atlas）。

---

### Task 1: 逻辑层 slots 扩到 9 + 上阵上限 6 约束（reducer）

**Files:**

- Modify: `assets/samples/game_auto_battle/logic/lineup.ts`
- Test: `tests/framework/foundation/game-auto-battle-lineup.test.ts`

**Interfaces:**

- Consumes: `FORMATION_GRID_SIZE`（`logic/grid.ts`，值 9）、`MAX_TEAM_SIZE`（`logic/config.ts`，值 6）、`editLineup(lineup, action)` 现有签名。
- Produces: `editLineup` 新语义——slot 越界检查改用 `FORMATION_GRID_SIZE`；fill 空槽时非空数 ≥ `MAX_TEAM_SIZE` 拒绝（返回原对象）；fill 已占槽（替换）不受上限约束。

- [ ] **Step 1: 更新测试 helper 用 FORMATION_GRID_SIZE 定长，新增上限/越界用例**

修改 `tests/framework/foundation/game-auto-battle-lineup.test.ts`：

```ts
import { FORMATION_GRID_SIZE } from "../../../assets/samples/game_auto_battle/logic/grid";
import { MAX_TEAM_SIZE } from "../../../assets/samples/game_auto_battle/logic/config";
import { editLineup } from "../../../assets/samples/game_auto_battle/logic/lineup";
import type { AutoBattleLineup } from "../../../assets/samples/game_auto_battle/models";

/** 构造定长空编队（空槽为 null），长度为布阵区容量 FORMATION_GRID_SIZE。 */
function emptyLineup(): AutoBattleLineup {
    return { slots: Array.from({ length: FORMATION_GRID_SIZE }, () => null) };
}

/** 构造带指定占用槽的编队：{[slot]: heroId}。 */
function lineupWith(occupied: Readonly<Record<number, string>>): AutoBattleLineup {
    const slots = Array.from<unknown, string | null>({ length: FORMATION_GRID_SIZE }, () => null);
    for (const [slot, heroId] of Object.entries(occupied)) {
        slots[Number(slot)] = heroId;
    }
    return { slots };
}
```

替换原 `fill beyond the team size upper bound is rejected` 测试，并新增用例：

```ts
test("fill beyond the formation size is rejected", () => {
    const lineup = lineupWith({ 0: "h1" });
    const result = editLineup(lineup, {
        type: "fill",
        slot: FORMATION_GRID_SIZE,
        heroId: "h2",
    });

    // 拒绝 = 返回原对象（引用不变），槽位不超出布阵区容量
    expect(result).toBe(lineup);
});

test("fill beyond the deploy cap is rejected when the target slot is empty", () => {
    // 已上阵 MAX_TEAM_SIZE 个英雄，再填新英雄到空槽应被拒
    const occupied: Record<number, string> = {};
    for (let slot = 0; slot < MAX_TEAM_SIZE; slot += 1) {
        occupied[slot] = `h${slot}`;
    }
    const lineup = lineupWith(occupied);
    const result = editLineup(lineup, {
        type: "fill",
        slot: MAX_TEAM_SIZE,
        heroId: "new",
    });

    expect(result).toBe(lineup);
});

test("replacing an occupied slot is allowed even when the deploy cap is reached", () => {
    const occupied: Record<number, string> = {};
    for (let slot = 0; slot < MAX_TEAM_SIZE; slot += 1) {
        occupied[slot] = `h${slot}`;
    }
    const lineup = lineupWith(occupied);
    const result = editLineup(lineup, {
        type: "fill",
        slot: 0,
        heroId: "new",
    });

    expect(result.slots[0]).toBe("new");
});

test("moving a hero into an empty slot is allowed when the deploy cap is reached", () => {
    // 满编后把 h0 从 slot0 移到空 slot6（不增加上阵数）
    const occupied: Record<number, string> = {};
    for (let slot = 0; slot < MAX_TEAM_SIZE; slot += 1) {
        occupied[slot] = `h${slot}`;
    }
    const lineup = lineupWith(occupied);
    const result = editLineup(lineup, {
        type: "fill",
        slot: MAX_TEAM_SIZE,
        heroId: "h0",
    });

    expect(result.slots[0]).toBeNull();
    expect(result.slots[MAX_TEAM_SIZE]).toBe("h0");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test ./tests/framework/foundation/game-auto-battle-lineup.test.ts`
Expected: FAIL——`fill beyond the formation size` 与 `fill beyond the deploy cap` 仍被当前实现按 `MAX_TEAM_SIZE=6` 判定，`slot 6` 填充被拒绝逻辑不符新语义。

- [ ] **Step 3: 修改 reducer 实现**

修改 `assets/samples/game_auto_battle/logic/lineup.ts`：

```ts
import { MAX_TEAM_SIZE } from "./config";
import { FORMATION_GRID_SIZE } from "./grid";
import type { AutoBattleLineup } from "../models";

/** 编队编辑动作：填充/替换指定槽，或卸下指定槽。 */
export type LineupAction = { readonly type: "fill"; readonly slot: number; readonly heroId: string } | { readonly type: "remove"; readonly slot: number };

/**
 * 编队 reducer：纯函数状态变换，返回新的 AutoBattleLineup（不可变，输入不被
 * 修改）。槽位越界（< 0 或 >= 布阵区容量 FORMATION_GRID_SIZE）视为拒绝——返回
 * 原对象（引用不变），给交互层可预期的拒绝语义。fill 保证英雄唯一：同一英雄
 * 已占别的槽时先清空该槽再填入目标槽。上阵上限约束：目标槽为空且当前非空数
 * 已达 MAX_TEAM_SIZE 时拒绝（不增加上阵数）；目标槽已占（替换）不受此限。
 * slot 语义 = 定长编队槽位（含空槽），与开战实例化时的压缩 index（只含已上阵
 * 序）解耦（见 design.md D1 衔接说明）。
 */
export function editLineup(lineup: AutoBattleLineup, action: LineupAction): AutoBattleLineup {
    const slot = action.slot;
    if (slot < 0 || slot >= FORMATION_GRID_SIZE) {
        return lineup;
    }

    if (action.type === "remove") {
        if (lineup.slots[slot] === null) {
            return lineup;
        }
        const next = [...lineup.slots];
        next[slot] = null;
        return { slots: next };
    }

    const next = [...lineup.slots];
    const existing = next.indexOf(action.heroId);
    if (existing !== -1 && existing !== slot) {
        next[existing] = null;
    }
    // 目标槽已是该英雄：无实际变化，返回原对象保持幂等
    if (next[slot] === action.heroId) {
        return lineup;
    }
    // 上阵上限：目标槽为空且当前非空数已达上限，拒绝新增上阵
    if (next[slot] === null) {
        const occupiedCount = next.reduce<number>((count, heroId) => (heroId === null ? count : count + 1), 0);
        if (occupiedCount >= MAX_TEAM_SIZE) {
            return lineup;
        }
    }
    next[slot] = action.heroId;
    return { slots: next };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test ./tests/framework/foundation/game-auto-battle-lineup.test.ts`
Expected: PASS（含既有 fill/remove/幂等/不修改输入用例）。

- [ ] **Step 5: 运行相关单测确认无回归**

Run: `bun test ./tests/framework/foundation`
Expected: 除后续任务将更新的 store/presenter 测试外，其余全绿（当前 step 中 `game-auto-battle-lineup-store.test.ts` 可能因 helper 用 `MAX_TEAM_SIZE` 与 `isLineupRecord` 未改而失败——该文件在 Task 2 更新，可接受此处暂不通过）。

---

### Task 2: 存档 schema v1→v2 迁移（slots 6 长度 → 9 长度）

**Files:**

- Modify: `assets/samples/game_auto_battle/logic/lineup-store.ts`
- Test: `tests/framework/foundation/game-auto-battle-lineup-store.test.ts`

**Interfaces:**

- Consumes: `FORMATION_GRID_SIZE`（`logic/grid.ts`）、`MAX_TEAM_SIZE`（`logic/config.ts`）、`createLineupStore(options)` 现有签名。
- Produces: `LINEUP_SAVE_VERSION=2`；内置 v1→v2 迁移器（6 长度 slots 补 3 个 `null` 到 9）；`isLineupRecord` 长度校验改用 `FORMATION_GRID_SIZE`；`createLineupStore` 默认 `migrators={ 1: migrateV1ToV2 }`。

- [ ] **Step 1: 更新 store 测试 helper 与迁移用例**

修改 `tests/framework/foundation/game-auto-battle-lineup-store.test.ts`：

```ts
import { MemoryPlatform } from "../../../assets/framework/adapters/memory/MemoryPlatform";
import type { PlatformStorage } from "../../../assets/framework/contracts/platform/Platform";
import { MAX_TEAM_SIZE } from "../../../assets/samples/game_auto_battle/logic/config";
import { FORMATION_GRID_SIZE } from "../../../assets/samples/game_auto_battle/logic/grid";
import { LINEUP_STORAGE_KEY, LINEUP_SAVE_VERSION, createLineupStore } from "../../../assets/samples/game_auto_battle/logic/lineup-store";
import type { AutoBattleLineup } from "../../../assets/samples/game_auto_battle/models";

/** 构造合法编队：指定占用槽，其余为 null；定长为布阵区容量 FORMATION_GRID_SIZE。 */
function lineup(occupied: Readonly<Record<number, string>> = {}): AutoBattleLineup {
    const slots = Array.from<unknown, string | null>({ length: FORMATION_GRID_SIZE }, () => null);
    for (const [slot, heroId] of Object.entries(occupied)) {
        slots[Number(slot)] = heroId;
    }
    return { slots };
}
```

在 `describe("Auto-battle lineup store schema migration")` 中新增默认迁移测试，并调整既有无迁移器测试：

```ts
test("migrates a legacy v1 record (6-length slots) to v2 (9-length) by default", async () => {
    const storage = new MemoryPlatform();
    // 旧版本 v1 存档：slots 为 6 长度（MAX_TEAM_SIZE），这正是旧 schema 的定长
    const legacySlots = Array.from<unknown, string | null>({ length: MAX_TEAM_SIZE }, () => null);
    legacySlots[0] = "a";
    await seed(storage, JSON.stringify({ version: 1, data: { slots: legacySlots } }));

    const store = createLineupStore({ storage });

    const loaded = await store.load();
    expect(loaded?.version).toBe(LINEUP_SAVE_VERSION);
    expect(loaded?.data.slots).toHaveLength(FORMATION_GRID_SIZE);
    expect(loaded?.data.slots[0]).toBe("a");
    expect(loaded?.data.slots[MAX_TEAM_SIZE]).toBeNull();
    expect(loaded?.data.slots[FORMATION_GRID_SIZE - 1]).toBeNull();
});

test("save writes at the current (v2) version", async () => {
    const storage = new MemoryPlatform();
    const store = createLineupStore({ storage });

    await store.save(lineup({ 0: "a" }));

    const raw = await storage.get(LINEUP_STORAGE_KEY);
    const parsed = JSON.parse(raw!) as { version: number; data: AutoBattleLineup };
    expect(parsed.version).toBe(2);
    expect(parsed.data.slots).toHaveLength(FORMATION_GRID_SIZE);
});
```

保留既有的"自定义迁移链（currentVersion:2 + migrators: {1:...}）"测试；删除或改写 `rejects an older record when no migrator is registered` 测试（默认已内置 v1→v2，改为对"缺失更高版本迁移器"的断言或直接移除，由既有 `migrate` 逻辑覆盖）。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test ./tests/framework/foundation/game-auto-battle-lineup-store.test.ts`
Expected: FAIL——默认迁移测试找不到 v1→v2 迁移器；helper 用 `FORMATION_GRID_SIZE=9` 但 `isLineupRecord` 仍校验 6。

- [ ] **Step 3: 修改 store 实现**

修改 `assets/samples/game_auto_battle/logic/lineup-store.ts`：

```ts
import type { Module, PlatformStorage } from "../../../framework";
import type { AutoBattleLineup } from "../models";
import { MAX_TEAM_SIZE } from "./config";
import { FORMATION_GRID_SIZE } from "./grid";

/** lineup 存档 schema 版本：升级时递增，迁移器映射按版本注册。 */
export const LINEUP_SAVE_VERSION = 2;

/** 底层存储键：命名空间 + 存档键编码，供测试直接播种旧版本/损坏记录。 */
export const LINEUP_STORAGE_KEY = "auto-battle:auto_battle:lineup";

/** 迁移器：把某旧版本的 lineup 存档数据升级为下一版本数据。 */
export type LineupSaveMigrator = (data: unknown) => unknown;

/**
 * v1 → v2 迁移器：布阵区容量扩到 9，旧 6 长度 slots 补齐到 9（尾部补 null）。
 * 玩家上阵数据不变，仅扩展可操作槽位数。
 */
export const MIGRATE_V1_TO_V2: LineupSaveMigrator = (data) => {
    const record = data as { slots: readonly (string | null)[] };
    const slots: (string | null)[] = Array.from({ length: FORMATION_GRID_SIZE }, (_, index) => record.slots[index] ?? null);
    return { slots };
};
```

在 `createLineupStore` 内修改：

```ts
export function createLineupStore(options: LineupStoreOptions): LineupStore {
    const { storage } = options;
    const currentVersion = options.currentVersion ?? LINEUP_SAVE_VERSION;
    // 默认迁移器：内置 v1→v2（slots 6→9 补齐）；调用方可覆盖
    const migrators = options.migrators ?? { 1: MIGRATE_V1_TO_V2 };
    // ... 其余不变
```

并修改 `isLineupRecord`：

```ts
function isLineupRecord(value: unknown): value is AutoBattleLineup {
    if (value === null || typeof value !== "object") {
        return false;
    }
    const slots = (value as { slots?: unknown }).slots;
    if (!Array.isArray(slots) || slots.length !== FORMATION_GRID_SIZE) {
        return false;
    }
    return slots.every((slot) => slot === null || typeof slot === "string");
}
```

同步更新文件头注释（`LINEUP_SAVE_VERSION=2`、迁移器说明）。

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test ./tests/framework/foundation/game-auto-battle-lineup-store.test.ts`
Expected: PASS。

---

### Task 3: 装配层 slots 定长改用 FORMATION_GRID_SIZE

**Files:**

- Modify: `assets/samples/game_auto_battle/assembly.ts`

**Interfaces:**

- Consumes: `FORMATION_GRID_SIZE`（`logic/grid.ts`）、`MAX_TEAM_SIZE`（`logic/config.ts`）。
- Produces: `toFullLineup(ids)` 定长 `FORMATION_GRID_SIZE`；`selectHero` 选中槽/空槽范围扩到 9。

- [ ] **Step 1: 修改 assembly.ts**

修改 `assets/samples/game_auto_battle/assembly.ts`：

- import 增加 `FORMATION_GRID_SIZE`：从 `./logic/grid` 引入。
- `toFullLineup` 定长改为 `FORMATION_GRID_SIZE`：

```ts
/** 压缩 heroId 序列 → 定长编队（空槽 null）；不足布阵区容量 FORMATION_GRID_SIZE 的部分留空。 */
function toFullLineup(ids: readonly string[]): AutoBattleLineup {
    const slots: (string | null)[] = Array.from({ length: FORMATION_GRID_SIZE }, () => null);
    ids.forEach((heroId, index) => {
        slots[index] = heroId;
    });
    return { slots };
}
```

- `lineupCommands.selectHero` 选中槽合法范围改用 `FORMATION_GRID_SIZE`：

```ts
selectHero(heroId) {
    // 优先填入选中的布阵格（替换语义），否则填第一个空槽；满编（MAX_TEAM_SIZE）
    // 由 reducer 拒绝，空槽查找仍遍历全部布阵格
    const target =
        selectedSlot !== null && selectedSlot < FORMATION_GRID_SIZE
            ? selectedSlot
            : lineup.slots.findIndex((heroIdAt) => heroIdAt === null);
    if (target === -1) {
        return;
    }
    lineup = editLineup(lineup, { type: "fill", slot: target, heroId });
    persistLineup();
},
```

- [ ] **Step 2: 运行相关单测确认通过**

Run: `bun test ./tests/framework/foundation/game-auto-battle-fixture.test.ts ./tests/framework/foundation/game-auto-battle-lineup.test.ts`
Expected: PASS。

---

### Task 4: 视图层槽位绑定扩 9 + 删除候选预置绑定

**Files:**

- Modify: `assets/samples/game_auto_battle/view/lineup.ts`
- Test: `tests/framework/foundation/game-auto-battle-lineup-view.test.ts`

**Interfaces:**

- Consumes: `FORMATION_GRID_SIZE`（`logic/grid.ts`）；`LineupEditorViewModel` 候选数据（candidates）仍保留供 GList 消费。
- Produces: 删除 `LINEUP_CANDIDATE_SLOTS` 与 `candidate_{i}` 预置绑定；槽位绑定循环 `slot < FORMATION_GRID_SIZE`（9）；候选渲染移交给 presenter 的列表句柄。

- [ ] **Step 1: 更新视图测试**

修改 `tests/framework/foundation/game-auto-battle-lineup-view.test.ts`：

```ts
import { FORMATION_GRID_SIZE } from "../../../assets/samples/game_auto_battle/logic/grid";

function lineup(slots: readonly (string | null)[]): AutoBattleLineup {
    return {
        slots: Array.from({ length: FORMATION_GRID_SIZE }, (_, i) => slots[i] ?? null),
    };
}
```

删除 `describe("Auto-battle lineup editor bindings")` 中的 `clicking a candidate selects that hero` 测试（候选点击改由 GList 句柄渲染，不在预置绑定层）。新增 9 槽绑定断言：

```ts
test("slot bindings cover the full formation size (9 slots)", () => {
    const calls: string[] = [];
    const heroes: readonly AutoBattleHero[] = Array.from({ length: 9 }, (_, i) => hero(`h${i}`, `H${i}`));
    const vm = createLineupEditorViewModel(heroes, lineup(["h0", null, "h2", "h3", null, "h5", "h6", null, "h8"]), null);
    const view = recordingView();
    const renderer = createViewModelRenderer<LineupEditorViewModel>({
        node: view.node,
        bindings: createLineupEditorBindings({
            selectSlot: (s) => calls.push(`slot:${s}`),
            selectHero: () => {},
            removeFromSlot: (s) => calls.push(`remove:${s}`),
            startBattle: () => {},
        }),
    });
    renderer.setViewModel(vm);

    expect(view.nodes.get("txt_slot_0_name")?.text).toBe("H0");
    expect(view.nodes.get("txt_slot_6_name")?.text).toBe("H6");
    expect(view.nodes.get("txt_slot_8_name")?.text).toBe("H8");
    expect(view.nodes.get("slot_8")?.clickHandler).toBeDefined();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test ./tests/framework/foundation/game-auto-battle-lineup-view.test.ts`
Expected: FAIL——`slot_8` 绑定仍只覆盖 6 个槽位，`txt_slot_6_name`/`txt_slot_8_name` 未写入。

- [ ] **Step 3: 修改视图实现**

修改 `assets/samples/game_auto_battle/view/lineup.ts`：

```ts
import type { Binding } from "../../../framework";
import { MAX_TEAM_SIZE } from "../logic/config";
import { FORMATION_GRID_SIZE } from "../logic/grid";
import type { AutoBattleHero, AutoBattleLineup } from "../models";
```

删除 `LINEUP_CANDIDATE_SLOTS` 常量。保留 `LineupCandidateView` 接口与 `createLineupEditorViewModel`（候选数据供列表句柄消费）。`createLineupEditorBindings` 中：

- 删除 `for (let index = 0; index < LINEUP_CANDIDATE_SLOTS; index += 1) {...}` 整个候选绑定循环。
- 槽位绑定循环 `for (let slot = 0; slot < MAX_TEAM_SIZE; slot += 1)` 改为 `for (let slot = 0; slot < FORMATION_GRID_SIZE; slot += 1)`。

同步更新函数注释（候选区渲染移交 presenter 列表句柄；布阵区槽位覆盖全部布阵格）。

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test ./tests/framework/foundation/game-auto-battle-lineup-view.test.ts`
Expected: PASS。

---

### Task 5: FairyGuiListHandle 引擎无关契约

**Files:**

- Create: `assets/framework/contracts/ui/List.ts`
- Modify: `assets/framework/index.ts`
- Test: `tests/framework/foundation/contracts.typecheck.ts`

**Interfaces:**

- Consumes: `ViewModelNode`（`contracts/ui/ViewModel.ts`）。
- Produces: `FairyGuiListItemView<T>`（index + item + field 子节点解析）、`FairyGuiListHandle<T>`（setItems / setItemRenderer / setItemClick）；经 `framework/index.ts` 导出。

- [ ] **Step 1: 创建契约文件**

创建 `assets/framework/contracts/ui/List.ts`：

```ts
import type { ViewModelNode } from "./ViewModel";

/**
 * 引擎无关的 GList 视图句柄契约：渲染器/游戏层消费它驱动 fgui 虚拟列表，
 * 不接触 fgui 类型。实现由 Adapter 边界包装 GList，itemRenderer 内把每个
 * item 对象包装为可读写的视图（field 解析 item 内子节点）。
 */

/** 单个列表项的可读写视图：根数据 + 按字段名解析 item 内子节点。 */
export interface FairyGuiListItemView<T> {
    readonly index: number;
    readonly item: T;
    /** 解析 item 内子节点；节点不存在返回 undefined（对齐未知节点容错）。 */
    field(name: string): ViewModelNode | undefined;
}

/** 引擎无关列表句柄：设置数据、渲染回调与点击回调。 */
export interface FairyGuiListHandle<T> {
    /** 更新列表数据并驱动 numItems（触发 itemRenderer 渲染可视项）。 */
    setItems(items: readonly T[]): void;
    /** 设置 item 渲染回调：适配层对每个可视 item 对象调用一次渲染器。 */
    setItemRenderer(renderer: (view: FairyGuiListItemView<T>) => void): void;
    /**
     * 设置 item 点击回调：适配层对每个 item 对象去重注册一次点击，点击时
     * 动态解析该对象当前 index 对应的 item（虚拟列表对象复用，不可闭包捕获
     * 渲染时的 index）。
     */
    setItemClick(handler: (index: number, item: T) => void): void;
}
```

- [ ] **Step 2: framework index 导出**

在 `assets/framework/index.ts` 的 contracts/ui 导出区（`ViewModel` 导出附近）追加：

```ts
export type { FairyGuiListItemView, FairyGuiListHandle } from "./contracts/ui/List";
```

- [ ] **Step 3: typecheck 确认导出与契约类型编译通过**

Run: `bun run test:foundation:types`
Expected: PASS（该脚本编译 framework 全部非 cocos TS + contracts.typecheck）。

---

### Task 6: cocos 适配层 FairyGuiListHandle 实现

**Files:**

- Create: `assets/framework/adapters/cocos/ui/FairyGuiListHandle.ts`
- Modify: `assets/boot/host/GameLobbyHostImpl.ts`
- Modify: `assets/game/lobby/host.ts`
- Modify: `assets/game/lobby/presenter.ts`
- Modify: `assets/game/lobby/lobby.ts`
- Modify: `assets/samples/entry.ts`
- Modify: `assets/samples/game_auto_battle/view/lineup-presenter.ts`
- Test: `tests/framework/foundation/game-auto-battle-lineup-presenter.test.ts`

**Interfaces:**

- Consumes: `FairyGuiListHandle`/`FairyGuiListItemView`（Task 5）、`wrapFairyGuiObject`（`FairyGuiViewHandle.ts`）、`GList`（fairygui-cc）。
- Produces: `createFairyGuiListHandle<T>(list)` 与 `createFairyGuiListViewHandle(view)`（按名解析 GList）；`EntryPageHandle.list` 可选列表解析器；`GamePresenterFactory` 第 4 可选参数 `list`；`createLineupEditorPresenter` 接收 list 解析器并在 render 时驱动候选列表。

- [ ] **Step 1: 创建适配层实现**

创建 `assets/framework/adapters/cocos/ui/FairyGuiListHandle.ts`：

```ts
import { Event, GComponent, GList, GObject } from "fairygui-cc";
import type { FairyGuiListItemView, FairyGuiListHandle } from "../../../contracts/ui/List";
import { wrapFairyGuiObject } from "./FairyGuiViewHandle";

/**
 * 把 fgui GList 包装为引擎无关 FairyGuiListHandle。itemRenderer 内把每个
 * item 对象包装为 FairyGuiListItemView（field 解析 item 内子节点），并把
 * 该对象的当前 index 记录到 WeakMap；点击回调去重注册一次，触发时按对象
 * 当前 index 动态解析 item（虚拟列表对象复用，滚动后 index 变化仍正确）。
 * fgui 类型只存在于本 Adapter 边界；渲染器/游戏层只消费 FairyGuiListHandle
 * 契约。
 */
export function createFairyGuiListHandle<T>(list: GList): FairyGuiListHandle<T> {
    let items: readonly T[] = [];
    let renderer: ((view: FairyGuiListItemView<T>) => void) | undefined;
    let clickHandler: ((index: number, item: T) => void) | undefined;
    // 对象 → 当前 index：itemRenderer 每次渲染更新，点击时动态读取
    const objIndex = new WeakMap<GObject, number>();
    // 已注册点击的 item 对象集合：虚拟列表复用对象，避免重复注册监听
    const registeredClick = new Set<GObject>();

    list.itemRenderer = (index: number, obj: GObject): void => {
        objIndex.set(obj, index);
        const item = items[index];
        if (item === undefined) {
            return;
        }
        renderer?.({
            index,
            item,
            field: (name: string) => {
                const child = (obj as GComponent).getChild(name);
                return child === null ? undefined : wrapFairyGuiObject(child);
            },
        });
        if (clickHandler !== undefined && !registeredClick.has(obj)) {
            registeredClick.add(obj);
            obj.on(
                Event.CLICK,
                () => {
                    const currentIndex = objIndex.get(obj);
                    const currentItem = currentIndex === undefined ? undefined : items[currentIndex];
                    if (currentIndex !== undefined && currentItem !== undefined) {
                        clickHandler(currentIndex, currentItem);
                    }
                },
                obj,
            );
        }
    };

    return {
        setItems(next: readonly T[]): void {
            items = next;
            list.numItems = next.length;
        },
        setItemRenderer(next: (view: FairyGuiListItemView<T>) => void): void {
            renderer = next;
        },
        setItemClick(next: (index: number, item: T) => void): void {
            clickHandler = next;
        },
    };
}

/**
 * 视图节点接缝：包装 fgui 页面根组件按名解析 GList 并暴露 FairyGuiListHandle。
 * 节点不是 GList 或不存在时返回 undefined（渲染器按契约跳过该绑定）。
 */
export function createFairyGuiListViewHandle(view: GComponent): (name: string) => FairyGuiListHandle<unknown> | undefined {
    return (name: string): FairyGuiListHandle<unknown> | undefined => {
        const child = view.getChild(name);
        if (child === null || !(child instanceof GList)) {
            return undefined;
        }
        return createFairyGuiListHandle<unknown>(child);
    };
}
```

- [ ] **Step 2: EntryPageHandle 增加可选 list 解析器**

修改 `assets/game/lobby/host.ts`：

```ts
import type { ViewModelNode } from "../../framework";
import type { FairyGuiListHandle } from "../../framework";
import type { GameEntryInfo } from "./catalog";
```

在 `EntryPageHandle` 中追加：

```ts
    /** 真实页面节点解析器：按名解析 fgui 节点，供呈现器装配渲染。 */
    readonly node: (name: string) => ViewModelNode | undefined;
    /**
     * 可选列表解析器：按名解析 fgui GList 并包装为引擎无关句柄，供含虚拟
     * 列表的页面（如编队页候选区）呈现器驱动。无列表的页面为 undefined。
     */
    readonly list?: (name: string) => FairyGuiListHandle<unknown> | undefined;
```

- [ ] **Step 3: GamePresenterFactory 增加可选 list 参数**

修改 `assets/game/lobby/presenter.ts`：

```ts
import type { ViewModelNode } from "../../framework";
import type { FairyGuiListHandle } from "../../framework";
import type { GameFixture } from "../fixture/GameFixture";
import type { GameEntryInfo } from "./catalog";
```

```ts
/** 呈现器工厂：按品类装配 ViewModelRenderer 到注入的节点解析器；可选注入列表解析器。 */
export type GamePresenterFactory = (
    fixture: GameFixture,
    node: (name: string) => ViewModelNode | undefined,
    session?: GameSessionNavigator,
    list?: (name: string) => FairyGuiListHandle<unknown> | undefined,
) => GamePresenter;
```

- [ ] **Step 4: lobby 调用点传 list**

修改 `assets/game/lobby/lobby.ts` 的两处 presenter 装配（`enter` 与 `switchEntry`）：

```ts
const presenter = presenterFactory === undefined ? undefined : presenterFactory(fixture, page.node, navigate, page.list);
```

```ts
const presenter = presenterFactory(session.fixture, page.node, navigate, page.list);
```

- [ ] **Step 5: boot 装配 LineupEditorView 的 list 解析器**

修改 `assets/boot/host/GameLobbyHostImpl.ts`：

```ts
import { createFairyGuiListViewHandle } from "../../framework/adapters/cocos/ui/FairyGuiListHandle";
```

在 `openEntryPage` 中，构造 `node` 之后追加：

```ts
        // 编队页（LineupEditorView）含候选英雄 GList 虚拟列表：装配列表解析器，
        // presenter 经 page.list 驱动候选渲染（对齐战场页动态单位映射装配路径）
        const list =
            entry.resName === "LineupEditorView"
                ? createFairyGuiListViewHandle(page.view as never)
                : undefined;

        const handle: EntryPageHandle = {
            node,
            list,
            onClose: (callback: () => void) => {
```

- [ ] **Step 6: samples entry 无需改动（list 解析器由 boot 按 resName 装配）**

确认 `assets/samples/entry.ts` 不需要改（presenters 注册表签名由 `GamePresenterFactory` 类型驱动，`createLineupEditorPresenter` 适配新签名即可）。

- [ ] **Step 7: 更新 lineup-presenter 接收 list 并驱动候选列表**

修改 `assets/samples/game_auto_battle/view/lineup-presenter.ts`：

```ts
import type { ViewModelNode } from "../../../framework";
import type { FairyGuiListHandle } from "../../../framework";
import { createViewModelRenderer } from "../../../framework";
import type { GamePresenter } from "../../../game/lobby/presenter";
import type { GameSessionNavigator } from "../../../game/lobby/presenter";
import type { GameFixture } from "../../../game/fixture/GameFixture";
import { AUTO_BATTLE_BATTLE_ENTRY } from "../../../game/lobby/catalog";
import type { AutoBattleFixture } from "../assembly";
import { createLineupEditorBindings, createLineupEditorViewModel, type LineupCandidateView, type LineupEditorViewModel } from "./lineup";
import { createAutoBattlePresenter } from "./presenter";

export function createLineupEditorPresenter(
    fixture: GameFixture,
    node: (name: string) => ViewModelNode | undefined,
    session?: GameSessionNavigator,
    list?: (name: string) => FairyGuiListHandle<unknown> | undefined,
): GamePresenter {
    const autoBattle = fixture as AutoBattleFixture;

    // 候选英雄 GList 句柄：编队页候选区为虚拟列表，presenter 在 render 时
    // setItems 驱动；节点不存在（内存测试/非真实页面）时退化，候选不渲染
    const candidateList = list?.("candidate_list") as FairyGuiListHandle<LineupCandidateView> | undefined;
    if (candidateList !== undefined) {
        candidateList.setItemRenderer((view) => {
            view.field("txt_candidate_name")?.setText(view.item.heroName);
            view.field("mark_deployed")?.setVisible(view.item.deployed);
        });
        candidateList.setItemClick((_index, candidate) => {
            autoBattle.lineup.selectHero(candidate.heroId);
            render();
        });
    }

    const renderer = createViewModelRenderer<LineupEditorViewModel>({
        node,
        bindings: createLineupEditorBindings({
            // ... 既有 selectSlot/selectHero/removeFromSlot/startBattle 不变
        }),
    });

    function render(): void {
        const enemyIds = new Set(autoBattle.config.enemy.map((unit) => unit.id));
        const candidates = autoBattle.config.heroes.filter((hero) => !enemyIds.has(hero.id));
        // VM 派生候选数据（含 deployed 上阵态）供列表句柄消费，避免重复派生
        const vm = createLineupEditorViewModel(candidates, autoBattle.lineup.value, autoBattle.lineup.selectedSlot);
        renderer.setViewModel(vm);
        if (candidateList !== undefined) {
            candidateList.setItems(vm.candidates);
        }
    }
    // ... 其余不变
}
```

- [ ] **Step 8: 更新 presenter 测试**

修改 `tests/framework/foundation/game-auto-battle-lineup-presenter.test.ts`：

- 删除对 `txt_candidate_*` 与 `candidate_*` 节点名断言（候选区不再走预置绑定）。
- 新增"候选列表句柄驱动"测试：注入记录型 list 解析器，断言 `setItems` 收到非敌方候选且含 deployed 标记。

```ts
test("candidates are rendered through the list handle", async () => {
    const createAutoBattleFixture = await loadCreateAutoBattleFixture();
    const fixture = createAutoBattleFixture({ configContent: lineupContent() });
    await fixture.start();
    const view = recordingView();
    // 记录型列表解析器：捕获 candidate_list 句柄的 setItems 调用
    const listCalls: { items: readonly { heroId: string; deployed: boolean }[] }[] = [];
    const candidateList = {
        setItems: (items: readonly { heroId: string; deployed: boolean }[]) => {
            listCalls.push({ items });
        },
        setItemRenderer: () => {},
        setItemClick: () => {},
    };
    const list = (name: string) => (name === "candidate_list" ? candidateList : undefined);
    const presenter = createLineupEditorPresenter(fixture, view.node, undefined, list);

    // 候选 = 池中非敌方 [a,b,c,d]；e 是敌方固定阵容，不出现
    expect(listCalls[0]?.items.map((c) => c.heroId)).toEqual(["a", "b", "c", "d"]);
    // 初始己方 [a,b] 已上阵
    expect(listCalls[0]?.items.find((c) => c.heroId === "a")?.deployed).toBe(true);
    expect(listCalls[0]?.items.find((c) => c.heroId === "d")?.deployed).toBe(false);

    presenter.dispose();
    await fixture.dispose();
});
```

保留槽位相关测试（`clicking an occupied slot twice removes the hero`、`clicking start battle` 等），移除对候选预置节点名的依赖。

- [ ] **Step 9: 运行测试与类型检查**

Run: `bun test ./tests/framework/foundation/game-auto-battle-lineup-presenter.test.ts && bun run typecheck`
Expected: PASS；`bun run test:foundation:types` 也通过（新契约导出纳入编译）。

---

### Task 7: FGUI 组件改造（委派 fgui-designer）

**Files:**

- Modify: `ui/demo/assets/AutoBattle/LineupEditorView.xml`
- Create: `ui/demo/assets/Common/CandidateItem.xml`（候选英雄行模板，名称文本 + 已上阵标记）
- Modify: `ui/demo/assets/Common/package.xml`（仅通过 `fgui register-component`）

**Interfaces:**

- Consumes: `createLineupEditorBindings()` 的槽位节点名（`slot_0..8`、`txt_slot_0..8_name`、`slot_selected_0..8`）；presenter 列表句柄的候选节点名（`candidate_list` 容器、item 内 `txt_candidate_name`、`mark_deployed`）。
- Produces: 9 个布阵按钮（`slot_0..8`，透明 CommonButton 覆盖层）；候选区 GList 组件（`candidate_list`，defaultItem 指向 Common/CandidateItem）；Common/CandidateItem（按钮 + 名称文本 + 已上阵标记）。

- [ ] **Step 1: 委派 fgui-designer 补第 3 排布阵按钮**

委派 fgui-designer：在 `LineupEditorView.xml` 的 displayList 中，为 `slot_6/7/8`（xy 对应 `175,485` / `375,485` / `575,485`，size `180,150`，`alpha=0`）补 3 个 `CommonButton` 透明点击层，命名与既有 `slot_0..5` 一致。

- [ ] **Step 2: 委派 fgui-designer 建候选 item 模板**

委派 fgui-designer：新建 `Common/CandidateItem.xml`——含 `CommonButton` 按钮底、名称文本 `txt_candidate_name`、已上阵标记节点 `mark_deployed`（默认隐藏）。跨包引用仅指向 Common。

- [ ] **Step 3: 委派 fgui-designer 候选区改 GList**

委派 fgui-designer：删除 `LineupEditorView.xml` 中 `candidate_0..5` 与 `txt_candidate_0..5_name` 预置节点，替换为 GList 组件（`name="candidate_list"`，纵向布局、可滚动，`defaultItem` 指向 `Common/CandidateItem`）。候选面板区域尺寸约 `320×480`。

- [ ] **Step 4: 校验与发布**

Run: `bun run fgui validate --strict`
Expected: PASS（引用完整性、controller 配对、image/fill 误用、资源 id 续编冲突等全量检查）。

FGUI 编辑器发布 AutoBattle 与 Common 包（产物由编辑器生成，不手改 bin/atlas）；若编辑器不可达，明确记录待发布。

---

### Task 8: 全量验证与冒烟

**Files:**

- Modify: `tests/framework/foundation/game-auto-battle-lineup-editor.test.ts`（如存在候选预置断言则更新）

**Interfaces:**

- Consumes: Task 1-7 全部产物。
- Produces: 全量验证证据（typecheck / lint / test / fgui validate）。

- [ ] **Step 1: 检查遗留候选预置断言**

Run: `Select-String -Path "tests/framework/foundation/game-auto-battle-lineup-editor.test.ts" -Pattern "candidate_|txt_candidate"`
Expected: 无候选预置节点断言残留；若有则更新为列表句柄或删除。

- [ ] **Step 2: 全量类型检查**

Run: `bun run typecheck`
Expected: PASS。

- [ ] **Step 3: 全量 lint**

Run: `bun run lint`
Expected: PASS。

- [ ] **Step 4: 全量单测**

Run: `bun run test:foundation && bun run test:foundation:types`
Expected: PASS。

- [ ] **Step 5: FGUI 校验**

Run: `bun run fgui validate --strict`
Expected: PASS。

- [ ] **Step 6: 冒烟/截图核对（可选，编辑器可达时）**

Run: `?smoke=auto-battle` 链路验证编队→开战；LineupEditorView 截图核对 9 槽按钮与候选列表渲染（交 visual-verifier）。
