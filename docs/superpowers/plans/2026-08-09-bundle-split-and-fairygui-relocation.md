# 基础包 Bundle 拆分 + fairygui 迁移 framework 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 fairygui 迁入 `assets/framework/libs/`，并把 `game`/`samples`（五类 game_* 合并）配置为独立 Asset Bundle，使 boot 不再静态 import 任何 game 代码，基础包只含 boot+framework（+常驻 common/ui）。

**Architecture:** framework 提供全局 Bundle 模块注册桥（存于 globalThis，跨 bundle 共享），game/samples bundle 顶层副作用自注册模块描述符，boot 经注册桥动态读取 catalog/fixtures/smokes；boot→game 的静态依赖反向为 game→main。加载 bundle 内任一资源即触发整个 bundle 脚本加载（`provider.load` 底层即 `loadBundle`+`bundle.load`）。

**Tech Stack:** Cocos Creator 3.8.8、TypeScript strict、Bun（测试/CLI）、FairyGUI（`fairygui-cc`）。

## Global Constraints

- 注释用简体中文，只解释意图/权衡；标识符/API/错误消息/路径保持英文。
- 不新增第三方依赖；`framework/core`+`contracts` 只允许新增注册桥模块，不改既有内核行为。
- 不手改生成产物（`library/`、`build/`、`assets/ui/*/*.bin`）。
- boot 目录最终不得静态 import 任何 `game*` 路径（含 `game/fixture`）。
- samples 只能经 `import type` 引用 game 契约（运行时擦除），运行时一律经注册桥。
- 验证命令：`bun run typecheck`、`bun test ./tests/framework/foundation`、`bun run ccc build --platform web-desktop`、`bun run test:foundation:types`。
- 提交信息格式 `type: 中文描述`；每任务末尾提交。

---

## Phase A — fairygui 迁入 framework

### Task 1: fairygui 迁移到 `assets/framework/libs/`

**Files:**

- Move: `assets/third-party/fairygui/*`（含全部 `.meta`）→ `assets/framework/libs/fairygui/`
- Delete: `assets/third-party/`、`assets/third-party.meta`
- Modify: `import-map.json`、`doc/decisions/ADR-011-fairygui-runtime-introduction.md`

**Interfaces:**

- Consumes: 无（纯文件移动 + 映射路径变更）。
- Produces: `fairygui-cc` 裸包名仍解析到 `fairygui.mjs`，框架代码 `import { ... } from "fairygui-cc"` 无需改动。

- [ ] **Step 1: 移动文件并保 UUID**

```powershell
# 确保 framework/libs 目标存在
New-Item -ItemType Directory -Force -Path "assets/framework/libs/fairygui" | Out-Null
# 移动全部文件与 .meta（.meta 跟随文件，UUID 不变）
Get-ChildItem "assets/third-party/fairygui" -File | ForEach-Object {
    Move-Item -LiteralPath $_.FullName -Destination "assets/framework/libs/fairygui/"
}
# 删除空目录与 third-party.meta
Remove-Item -LiteralPath "assets/third-party/fairygui" -Force
Remove-Item -LiteralPath "assets/third-party.meta" -Force
Remove-Item -LiteralPath "assets/third-party" -Force
```

- [ ] **Step 2: 更新 import-map.json**

将 `import-map.json` 的映射改为：

```json
{ "imports": { "fairygui-cc": "./assets/framework/libs/fairygui/fairygui.mjs" } }
```

- [ ] **Step 3: 更新 ADR-011 决策 3**

把 ADR-011 决策 3 的 "vendor 到 `assets/third-party/fairygui`" 改为 `assets/framework/libs/fairygui`，并注明 `third-party` 目录已删除、迁移理由（fairygui 属 main bundle，避免第三包 bundle 化后跨包重复）。

- [ ] **Step 4: 验证**

Run: `bun run typecheck`
Expected: EXIT 0（`fairygui-cc` 类型解析不变）。

Run: `bun test ./tests/framework/foundation`
Expected: 全部通过（fairygui 相关测试如 `fairy-gui-page-adapter.test.ts`、`fairygui-package-loading.test.ts` 不回归）。

Run: `bun run test:foundation:types`
Expected: EXIT 0。

- [ ] **Step 5: 构建验证**

Run: `bun run ccc build --platform web-desktop`
Expected: 构建成功；`assets/main/index.js` 仍含 fairygui（main 内），无编译错误。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: fairygui 迁移到 framework/libs，删除 third-party 目录"
```

---

## Phase B — 全局注册桥 + 跨 bundle 脚本行为 spike

### Task 2: BundleModuleRegistry 全局注册桥 + 单元测试

**Files:**

- Create: `assets/framework/core/module/BundleModuleRegistry.ts`
- Modify: `assets/framework/index.ts`、`tests/framework/foundation/public-boundary.test.ts`
- Test: `tests/framework/foundation/bundle-module-registry.test.ts`

**Interfaces:**

- Consumes: 无。
- Produces:

```ts
// assets/framework/core/module/BundleModuleRegistry.ts
export interface BundleModuleRegistry {
    registerBundle(name: string, exports: Readonly<Record<string, unknown>>): void;
    lookupBundle(name: string): Readonly<Record<string, unknown>> | undefined;
}
export function getBundleModuleRegistry(): BundleModuleRegistry;
/** 便捷 helper：直接登记/查询（内部复用单例）。bundle 入口脚本顶层副作用使用。 */
export function registerBundle(name: string, exports: Readonly<Record<string, unknown>>): void;
export function lookupBundle(name: string): Readonly<Record<string, unknown>> | undefined;
```

- [ ] **Step 1: 写失败测试**

`tests/framework/foundation/bundle-module-registry.test.ts`：

```ts
import { describe, expect, it } from "bun:test";
import { getBundleModuleRegistry } from "../../../assets/framework/core/module/BundleModuleRegistry";

describe("BundleModuleRegistry", () => {
    it("register 后 lookup 可读回同一对象", () => {
        const registry = getBundleModuleRegistry();
        const exports = { fixtures: { card: () => ({}) } };
        registry.registerBundle("samples", exports);
        expect(registry.lookupBundle("samples")).toBe(exports);
    });
    it("同名 register 幂等覆盖", () => {
        const registry = getBundleModuleRegistry();
        registry.registerBundle("game", { a: 1 });
        registry.registerBundle("game", { b: 2 });
        expect(registry.lookupBundle("game")).toEqual({ b: 2 });
    });
    it("未注册返回 undefined", () => {
        expect(getBundleModuleRegistry().lookupBundle("no-such-bundle")).toBeUndefined();
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test ./tests/framework/foundation/bundle-module-registry.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现注册桥**

```ts
/**
 * 全局 Bundle 模块注册桥：存于 globalThis 私有符号键，供跨 Asset Bundle 脚本
 * 共享模块描述符（对齐 Cocos 官方"跨 bundle 共享暴露到全局命名空间"建议）。
 * registerBundle 幂等（bundle 重载时重新登记，避免残留旧描述符）；
 * lookupBundle 只在对应 bundle 加载后调用，避免隐式时序耦合。
 */
export interface BundleModuleRegistry {
    registerBundle(name: string, exports: Readonly<Record<string, unknown>>): void;
    lookupBundle(name: string): Readonly<Record<string, unknown>> | undefined;
}

const GLOBAL_KEY = "__ai_game_kit_bundle_modules__";

export function getBundleModuleRegistry(): BundleModuleRegistry {
    const globalObject = globalThis as Record<string, unknown>;
    const existing = globalObject[GLOBAL_KEY] as BundleModuleRegistry | undefined;
    if (existing !== undefined) {
        return existing;
    }
    const modules = new Map<string, Readonly<Record<string, unknown>>>();
    const registry: BundleModuleRegistry = {
        registerBundle(name, exports) {
            modules.set(name, exports);
        },
        lookupBundle(name) {
            return modules.get(name);
        },
    };
    globalObject[GLOBAL_KEY] = registry;
    return registry;
}

export function registerBundle(name: string, exports: Readonly<Record<string, unknown>>): void {
    getBundleModuleRegistry().registerBundle(name, exports);
}

export function lookupBundle(name: string): Readonly<Record<string, unknown>> | undefined {
    return getBundleModuleRegistry().lookupBundle(name);
}
```

- [ ] **Step 4: 根入口导出 + 白名单同步**

在 `assets/framework/index.ts` 追加：

```ts
export type { BundleModuleRegistry } from "./core/module/BundleModuleRegistry";
export { getBundleModuleRegistry, registerBundle, lookupBundle } from "./core/module/BundleModuleRegistry";
```

同步 `tests/framework/foundation/public-boundary.test.ts` 的 `expectedRootExports` 数组，加入 `BundleModuleRegistry`、`getBundleModuleRegistry`、`registerBundle`、`lookupBundle` 四个符号（该数组在文件约 470 行处，格式为字符串列表）。

- [ ] **Step 5: 运行验证**

Run: `bun test ./tests/framework/foundation/bundle-module-registry.test.ts`
Expected: PASS（3 个用例）。

Run: `bun test ./tests/framework/foundation/public-boundary.test.ts`
Expected: PASS（白名单断言通过）。

Run: `bun run typecheck`
Expected: EXIT 0。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 全局 BundleModuleRegistry 注册桥与单元测试"
```

### Task 3: 跨 bundle→main 脚本引用行为 spike（决定性事实）

**Files:**

- Create: `assets/_spike_bundle/`（临时，验证后删除）
- Delete: `assets/_spike_bundle/`（任务末尾）

**Interfaces:**

- Consumes: Task 2 的 `getBundleModuleRegistry`。
- Produces: 决策事实——bundle 脚本静态 import main（framework）时，Cocos 3.8 构建是"重复打进该 bundle chunk"还是"共享 main"。此结论决定 samples/game bundle 内 fixture 代码可不可以静态 import framework。

- [ ] **Step 1: 建立 spike bundle**

```powershell
New-Item -ItemType Directory -Force -Path "assets/_spike_bundle" | Out-Null
```

创建 `assets/_spike_bundle/spike.ts`：

```ts
import { createStateMachine } from "../framework";
export const spike = (): string => createStateMachine({ initial: "a", transitions: { a: {} } }).state;
```

创建 `assets/_spike_bundle.meta`（`isBundle: true`）：

```json
{
    "ver": "1.2.0",
    "importer": "directory",
    "imported": true,
    "uuid": "e0000000-0000-0000-0000-0000000000a1",
    "files": [],
    "subMetas": {},
    "userData": { "isBundle": true }
}
```

（注：若 `spike.ts` 的 `.meta` 由编辑器生成，请用编辑器重新导入后再构建；若 CLI 构建自动生成 meta，则无需手工写。）

- [ ] **Step 2: 构建并检查产物**

Run: `bun run ccc build --platform web-desktop`

检查构建产物：

```powershell
# 查看 spike bundle 的 index.js 是否包含 createStateMachine 的重复实现
$spike = Get-Content "build/web-desktop/assets/_spike_bundle/index.js" -Raw
"spike bundle size: $($spike.Length)"
$spike.Contains("createStateMachine")   # 关键：bundle 是否重复打进 framework 实现
```

Expected: 记录两项事实：(a) spike bundle 的 index.js 是否含 `createStateMachine`；(b) main/index.js 是否仍含它（对比 Task 1 后的基线）。同时观察构建日志是否有跨 bundle 脚本警告/报错。

- [ ] **Step 3: 记录结论并清理**

把结论写进计划备注（供后续任务参考）：若 (a) 为 false（共享 main）→ samples/game 可安全静态 import framework；若 (a) 为 true（重复打进）→ samples/game 的 framework import 会造成重复代码，需在后续任务把 fixture 对 framework 的依赖面最小化，并在设计文档"风险与回退"补记实测结论。

```powershell
Remove-Item -Recurse -Force "assets/_spike_bundle", "assets/_spike_bundle.meta"
```

- [ ] **Step 4: Commit（记录 spike 结论）**

在 `docs/superpowers/specs/2026-08-09-bundle-split-and-fairygui-relocation-design.md` 的"风险与回退"追加实测结论，然后：

```bash
git add -A
git commit -m "docs: 记录跨 bundle 脚本引用构建行为 spike 结论"
```

---

## Phase C — samples 合并 + game bundle 自注册

### Task 4: 五类 game_* 目录合并为 samples bundle

**Files:**

- Move: `assets/game_card/`、`assets/game_fight/`、`assets/game_idle/`、`assets/game_rpg/`、`assets/game_tycoon/`（含全部内容与 `.meta`）→ `assets/samples/`
- Create: `assets/samples.meta`（`isBundle: true`）、`assets/samples/placeholder.json`
- Modify: 上述目录内全部 `.ts` 的相对 import（`../../framework` → `../../../framework`；`../game/fixture/GameFixture` → `../../game/fixture/GameFixture`）
- Modify: `assets/game_fight/logic/audio.ts`、`assets/game_fight/logic/resource.ts`（`"fight"` → `"samples"`）
- Modify: `tests/framework/foundation/game-card-fixture.test.ts`、`game-fight-fixture.test.ts`、`game-idle-fixture.test.ts`、`game-rpg-fixture.test.ts`、`game-tycoon-fixture.test.ts`（assembly 路径）
- Test: 上述 5 个 fixture 测试

**Interfaces:**

- Consumes: 无。
- Produces: `assets/samples/` 目录结构就位，bundle 名 `samples`，品类代码路径更新完毕。

- [ ] **Step 1: 移动目录（保 UUID）**

```powershell
New-Item -ItemType Directory -Force -Path "assets/samples" | Out-Null
foreach ($name in @("game_card","game_fight","game_idle","game_rpg","game_tycoon")) {
    Move-Item -LiteralPath "assets/$name" -Destination "assets/samples/$name"
    Move-Item -LiteralPath "assets/$name.meta" -Destination "assets/samples/$name.meta"
}
```

- [ ] **Step 2: 创建 samples bundle 元数据与哨兵资源**

`assets/samples.meta`：

```json
{
    "ver": "1.2.0",
    "importer": "directory",
    "imported": true,
    "uuid": "e0000000-0000-0000-0000-0000000000b1",
    "files": [],
    "subMetas": {},
    "userData": { "isBundle": true }
}
```

`assets/samples/placeholder.json`：`{}`（对齐 common/ui/game-content 的占位模式，作为 `provider.load("samples","placeholder")` 的加载哨兵）。

- [ ] **Step 3: 批量修复相对 import**

对 `assets/samples/**/*.ts`：

- `"../../framework"` → `"../../../framework"`
- `"../game/fixture/GameFixture"` → `"../../game/fixture/GameFixture"`
- 其它深度变化按实际目录深度逐一修正（每个文件的 import 深度 +1）。

验证无遗漏：Run: `bun run typecheck`，Expected: 报错列出所有未修复路径，逐一修复后 EXIT 0。

- [ ] **Step 4: 修正硬编码 bundle 名**

`assets/samples/game_fight/logic/audio.ts`：`bundle: "fight"` → `bundle: "samples"`。
`assets/samples/game_fight/logic/resource.ts`：`canUnload("fight")` → `canUnload("samples")`。

- [ ] **Step 5: 修正测试 assembly 路径**

在 5 个 fixture 测试中，把 `resolve(projectRoot, "assets/game_xxx/assembly.ts")` 改为 `resolve(projectRoot, "assets/samples/game_xxx/assembly.ts")`。

- [ ] **Step 6: 验证**

Run: `bun run typecheck`
Expected: EXIT 0。

Run: `bun test ./tests/framework/foundation/game-card-fixture.test.ts ./tests/framework/foundation/game-fight-fixture.test.ts ./tests/framework/foundation/game-idle-fixture.test.ts ./tests/framework/foundation/game-rpg-fixture.test.ts ./tests/framework/foundation/game-tycoon-fixture.test.ts`
Expected: 全部 PASS。

Run: `bun test ./tests/framework/foundation`（全量，确认无其它回归）
Expected: 全量 PASS。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: game_* 品类合并为 samples bundle（含占位哨兵与 import 路径修复）"
```

### Task 5: game bundle 自注册机制（不设 isBundle）

**Files:**

- Modify: `assets/game/fixture/registry.ts`（静态 import → 运行时视图）
- Modify: `assets/game/lobby/catalog.ts`（去 `game_card/models` 静态 import）
- Modify: `assets/game/lobby/presenter.ts`（card 呈现器迁出至 samples；保留类型）
- Modify: `assets/game/lobby/lobby.ts`（registry 默认值改运行时、host 增 `loadBundle`）
- Modify: `assets/game/fixture/smoke.ts`、`assets/game/fixture/perf.ts`（registry 在调用时解析）
- Create: `assets/game/entry.ts`、`assets/samples/entry.ts`、`assets/game/lobby/host.ts`、`assets/samples/game_card/view/presenter.ts`
- Modify: `tests/framework/foundation/game-lobby-catalog.test.ts`、`game-lobby.test.ts`、`game-fixture-unified-lifecycle.test.ts`、`game-fixture-smoke.test.ts`、`game-fixture-perf.test.ts`
- Test: `game-lobby.test.ts`、`game-lobby-catalog.test.ts`、新增 samples 自注册测试、`game-fixture-unified-lifecycle.test.ts`

**Interfaces:**

- Consumes: Task 2 `getBundleModuleRegistry`/`registerBundle`/`lookupBundle`；Task 4 samples 目录。
- Produces:

```ts
// assets/samples/entry.ts（samples bundle 顶层副作用，单点合并登记，避免多文件各自 register 互相覆盖）
registerBundle("samples", {
    fixtures: { card, rpg, idle, tycoon, fight },
    presenters: { card },
});
// assets/game/entry.ts（game bundle 顶层副作用；smokes 由 Task 7 追加）
registerBundle("game", {
    catalog: gameTypeCatalog,
    sceneResources: sceneMap,
});
```

- [ ] **Step 1: catalog 去 game_card 静态依赖**

`assets/game/lobby/catalog.ts`：删除 `import { CARD_BATTLE_ROUTE } from "../../samples/game_card/models"`，`route` 改字面量 `"card/battle"`（与 `assets/samples/game_card/models/models.ts:37` 的 `CARD_BATTLE_ROUTE` 值一致）。

同步 `tests/framework/foundation/game-lobby-catalog.test.ts`：把 `CARD_BATTLE_ROUTE` 引用改为字面量断言。

- [ ] **Step 2: GameLobbyHost/EntryPageHandle 类型迁到 host.ts + 增可选 loadBundle**

`assets/game/lobby/host.ts`（新文件，承载 GameLobbyHost/EntryPageHandle 类型，供 boot 与 game 共享——boot 仅 `import type`）：

```ts
import type { ViewModelNode } from "../../framework";
import type { GameEntryInfo } from "./catalog";

export interface GameLobbyHost {
    openEntryPage(entry: GameEntryInfo): Promise<EntryPageHandle>;
    closeEntryPage(handle: EntryPageHandle): Promise<void>;
    /**
     * 确保某 Bundle 已加载（经 provider.load 哨兵资源触发脚本执行）；幂等。
     * 可选：boot 宿主在 Task 6 落地实现前，game bundle 内以 `?.()` 调用。
     */
    loadBundle?(bundle: string): Promise<void>;
}

export interface EntryPageHandle {
    readonly node: (name: string) => ViewModelNode | undefined;
    onClose(callback: () => void): void;
}
```

`lobby.ts` 删除本地 `GameLobbyHost`/`EntryPageHandle` 定义，改从 `./host` `import type`；`entry.ts` 入口处若需重导出请同步。

- [ ] **Step 3: registry 改运行时 + samples/entry 单点自注册**

`assets/game/fixture/registry.ts` 改为运行时视图（删除对 `../../samples/game_*/assembly` 的全部静态 import）：

```ts
import type { GameFixture } from "./GameFixture";
import { lookupBundle } from "../../framework";

export type GameFixtureFactory = () => GameFixture;
export interface SamplesModule {
    readonly fixtures: Readonly<Record<string, GameFixtureFactory>>;
}
/** 品类夹具运行时登记表：从 samples bundle 的全局注册读取；samples 未加载时为空。 */
export function gameFixtureRegistry(): Readonly<Record<string, GameFixtureFactory>> {
    const samples = lookupBundle("samples") as SamplesModule | undefined;
    return samples?.fixtures ?? {};
}
```

`assets/samples/entry.ts`（新文件，samples bundle 顶层副作用；同 bundle 内静态 import 五个 assembly 是安全的）：

```ts
import { registerBundle } from "../framework";
import { createCardFixture } from "./game_card/assembly";
import { createFightFixture } from "./game_fight/assembly";
import { createIdleFixture } from "./game_idle/assembly";
import { createRpgFixture } from "./game_rpg/assembly";
import { createTycoonFixture } from "./game_tycoon/assembly";
import { createCardBattlePresenter } from "./game_card/view/presenter";

registerBundle("samples", {
    fixtures: {
        card: createCardFixture,
        rpg: createRpgFixture,
        idle: createIdleFixture,
        tycoon: createTycoonFixture,
        fight: createFightFixture,
    },
    presenters: { card: createCardBattlePresenter },
});
```

（各 `game_*/assembly.ts` **不要**自行 `registerBundle`，避免同名覆盖。）

`assets/game/entry.ts`（新文件，game bundle 顶层副作用）：

```ts
import { registerBundle } from "../framework";
import { gameTypeCatalog } from "./lobby/catalog";
import { sceneMap } from "./fixture/scene";

registerBundle("game", {
    catalog: gameTypeCatalog,
    sceneResources: sceneMap,
});
```

- [ ] **Step 4: presenter 拆分 + smoke/perf/lobby 运行时解析**

`assets/game/lobby/presenter.ts`：只保留 `GamePresenter`/`GamePresenterFactory` 类型；`createCardBattlePresenter` 与 `gamePresenterRegistry` 迁出。
`assets/samples/game_card/view/presenter.ts`（新）：承载 `createCardBattlePresenter`（从 `game/lobby/presenter.ts` 迁入，调整 import）。
`game/lobby/lobby.ts`：`gamePresenterRegistry` 默认改为函数 `gamePresenterRegistry()`（读 `lookupBundle("samples").presenters`）；`enter` 内先 `await host.loadBundle?.("samples")` 再在调用时解析 registry/presenters。
`game/fixture/smoke.ts`、`game/fixture/perf.ts`：默认参数 `registry = gameFixtureRegistry` 改为可空参数，函数体内 `const registry = options.registry ?? gameFixtureRegistry()`（调用时解析）。

- [ ] **Step 5: 编写 samples 自注册测试**

新增 `tests/framework/foundation/bundle-module-registration.test.ts`：

```ts
import { describe, expect, it } from "bun:test";
import { registerBundle } from "../../../assets/framework";
import { gameFixtureRegistry } from "../../../assets/game/fixture/registry";
import type { GameFixture } from "../../../assets/game/fixture/GameFixture";

const stubFixture = (id: string): GameFixture => ({
    id,
    modules: [],
    start: async () => {},
    pause: async () => {},
    resume: async () => {},
    failRollback: async () => {},
    dispose: async () => {},
});

describe("samples 自注册桥", () => {
    it("registerBundle('samples', { fixtures }) 后 gameFixtureRegistry() 可读取", () => {
        registerBundle("samples", { fixtures: { card: () => stubFixture("card") } });
        const registry = gameFixtureRegistry();
        const fixture = registry["card"]?.();
        expect(fixture?.id).toBe("card");
    });
    it("samples 未注册时返回空表", () => {
        registerBundle("samples-other", {});
        const registry = gameFixtureRegistry();
        expect(Object.keys(registry)).toEqual([]);
    });
});
```

- [ ] **Step 6: 更新受影响单测**

`game-fixture-unified-lifecycle.test.ts`、`game-fixture-smoke.test.ts`、`game-fixture-perf.test.ts`、`game-lobby.test.ts`、`game-lobby-catalog.test.ts`：凡把 `gameFixtureRegistry` 当对象用的（`Object.keys(...)`、`[...]` 索引），改为先 `import "../../../assets/samples/entry"`（副作用触发登记）或显式 `registerBundle("samples", { fixtures: {...} })`，再用 `gameFixtureRegistry()` 调用形式。保持断言语义不变。

- [ ] **Step 7: 验证**

Run: `bun run typecheck`
Expected: EXIT 0。

Run: `bun test ./tests/framework/foundation/bundle-module-registration.test.ts ./tests/framework/foundation/game-lobby.test.ts ./tests/framework/foundation/game-lobby-catalog.test.ts ./tests/framework/foundation/game-fixture-unified-lifecycle.test.ts ./tests/framework/foundation/game-fixture-smoke.test.ts ./tests/framework/foundation/game-fixture-perf.test.ts`
Expected: 全部 PASS。

Run: `bun test ./tests/framework/foundation`（全量）
Expected: 全量 PASS（若有因 registry 语义变化的失败，修正后通过）。

（本任务不设 `game.meta isBundle`，不做构建验证；game 变 bundle 与 sceneMap 切换延迟到 Task 6，避免 main→bundle 静态 import 导致 game 代码重复打进 main。）

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: 品类夹具与呈现器经注册桥运行时自注册（samples/entry 单点登记）"
```

---

## Phase D — boot 解耦 + 冒烟重构

### Task 6: boot 解耦 game 静态依赖 + game 正式成 bundle

**Files:**

- Modify: `assets/game.meta`（`userData.isBundle: true`）
- Modify: `assets/game/fixture/scene.ts`（`bundle: "ui"` → `bundle: "game"`，paths `["game"]`）
- Modify: `assets/boot/AppRoot.ts`（删 game/fixture import；sceneMap/catalog 改经桥读；host 能力经桥注入）
- Modify: `assets/boot/host/GameLobbyHostImpl.ts`（删 `game/fixture/lobby` 运行时 import；改 `import type`；实现 `loadBundle`）
- Modify: `assets/boot/flow/BootFlow.ts`（sceneMap 动态源 + BOOTSTRAP_SCENE）
- Modify: `tests/framework/foundation/task68-scope-review.test.ts`（boot 允许 import 清单改为：禁任何 `game*`）
- Modify: `tests/framework/foundation/boot-flow.test.ts`、`boot-game-lobby-host.test.ts`（如依赖注入形态变化）
- Test: `task68-scope-review.test.ts`、`boot-flow.test.ts`、`boot-game-lobby-host.test.ts`

**Interfaces:**

- Consumes: Task 2 注册桥、Task 5 game bundle 模块、`BOOTSTRAP_SCENE`（本任务定义）。
- Produces: main（boot+framework）不含任何 game 静态引用；host-services 经注册桥注入 game bundle；`game` 正式成为 bundle。

- [ ] **Step 1: 定义 BOOTSTRAP_SCENE 并改 BootFlow**

在 `assets/boot/flow/BootFlow.ts`（或新增 `assets/boot/config/Bootstrap.ts`）：

```ts
/** 入口场景静态引导：main 必须知道首个 bundle 的入口场景才能加载它（配置非代码）。 */
export const BOOTSTRAP_SCENE: Readonly<Record<string, SceneResources>> = Object.freeze({
    game: Object.freeze({ bundle: "game", paths: ["game"] }),
});
```

BootFlow 的 `sceneMap` 依赖改为：默认使用 `BOOTSTRAP_SCENE`，game bundle 加载后经注册桥的 `sceneResources` 可覆盖/扩展。`AppRoot` 传入动态 `getSceneMap()` 而非静态 import。

- [ ] **Step 2: AppRoot 去 game 静态 import + 经桥注入 host 能力**

`assets/boot/AppRoot.ts`：

- 删除 `import { sceneMap, EntryPageHandle, GameEntryInfo } from "../game/fixture/lobby"`（类型改 `import type` 自 `../game/lobby/host` 或直接本地化）。
- `assembleApp` 后，把 host 能力写入桥：`registerBundle("host-services", { uiHost, lobbyHost })`（供 game bundle 的 lobby 编排经 `lookupBundle("host-services")` 获取宿主）。
- `createBootFlow` 的 `sceneMap` 参数改为 `() => gameModuleSceneResources()`（读 `lookupBundle("game").sceneResources`，回退 BOOTSTRAP_SCENE）。
- 默认流程 game 场景激活后，从桥读 `gameModule.catalog` 交给 lobby 宿主渲染列表页。

- [ ] **Step 3: GameLobbyHostImpl 去 game 运行时 import + 实现 loadBundle**

`assets/boot/host/GameLobbyHostImpl.ts`：

- `game/fixture/lobby` 的运行时符号（`createGameLobby`/`gameTypeCatalog`/`lobbyItemNodeName`/`LOBBY_LIST_ENTRY`）删除；类型改 `import type`。
- 列表页编排（`openListPage`/`openListPageWithRetry`）迁至 game bundle 的 lobby 模块（经 `host-services` 桥注入本宿主能力），boot 宿主只保留 `openEntryPage`/`closeEntryPage`/`ensureSharedUiDependencies` 原语。
- 新增 `loadBundle(bundle)`：`const handle = this.resourceProvider.load(bundle, "placeholder"); await handle.done;`（samples 用哨兵 placeholder；game 用 `"game"`）。同时把 `GameLobbyHost` 接口的 `loadBundle?` 收为必选。

- [ ] **Step 4: 标记 game bundle + 场景映射改指向（在 boot 去 import 之后）**

`assets/game.meta` 追加 `"userData": { "isBundle": true }`。
`assets/game/fixture/scene.ts` 的 sceneMap 改为：

```ts
export const sceneMap = Object.freeze({
    game: Object.freeze({ bundle: "game", paths: ["game"] }),
});
```

（此刻 boot 已不再静态 import 任何 game 代码，game 成 bundle 不会把 game 代码重复打进 main。）

- [ ] **Step 5: 更新 task68-scope-review 断言**

`tests/framework/foundation/task68-scope-review.test.ts`：把"boot 允许 import game/fixture"改为"boot 禁止任何 `game*` import"，断言 `boot/**/*.ts` 不包含 `from ".*game` 或 `game/fixture` 引用；新增断言 game/samples bundle 只能经注册桥与 `import type` 交互。

- [ ] **Step 6: 更新受影响单测**

`tests/framework/foundation/boot-flow.test.ts`、`boot-game-lobby-host.test.ts`、`approot-composition.test.ts`：把注入形态改为新接口（sceneMap 函数化、host 经桥），断言语义不变。跑 `bun test` 逐一定位并修正。

- [ ] **Step 7: 验证**

Run: `bun run typecheck`
Expected: EXIT 0。

Run: `bun test ./tests/framework/foundation/task68-scope-review.test.ts ./tests/framework/foundation/boot-flow.test.ts ./tests/framework/foundation/boot-game-lobby-host.test.ts ./tests/framework/foundation/approot-composition.test.ts`
Expected: 全部 PASS。

Run: `bun test ./tests/framework/foundation`（全量）
Expected: 全量 PASS。

Run: `bun run ccc build --platform web-desktop`
Expected: 构建成功；`assets/game/`、`assets/samples/` 各自生成 `index.js`；`assets/main/config.json` 的 scenes 不再含 `game.scene`；grep 校验 `assets/main/index.js` 不再含 `gameFixtureRegistry`/`createCardFixture`。

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: boot 解耦 game 静态依赖，game 正式成 bundle（host 经注册桥反向注入）"
```

### Task 7: 冒烟系统重构（URL 分派经 bundle 动态加载）

**Files:**

- Move: `assets/boot/smoke/ui-smoke.ts`、`scene-smoke.ts`、`modal-click.ts` → `assets/game/smoke/`
- Move: `assets/boot/smoke/card-battle.ts`、`perf.ts` → `assets/samples/`（自注册）
- Modify: `assets/boot/smoke/smoke-proxy.ts`、`assets/boot/flow/SmokeRouter.ts`（tag → `{ bundle, entry }` 映射，动态加载后运行）
- Modify: `assets/game/smoke/*`、`assets/samples/game_fight/*`（注册进 game/samples 模块的 `smokes`）
- Modify: `assets/boot/smoke/smoke-proxy.ts` 依赖注入
- Test: `tests/framework/foundation/boot-smoke-router.test.ts`、`game-fixture-smoke.test.ts`、`game-fixture-perf.test.ts`

**Interfaces:**

- Consumes: Task 5 的 game/samples 模块 `smokes`；Task 6 的桥。
- Produces: 冒烟 URL 分派经 `{ bundle, entry }` 表 + `provider.load(bundle 哨兵)` + `lookupBundleModule(bundle).smokes[entry]()` 执行。

- [ ] **Step 1: 迁移通用冒烟进 game bundle**

`assets/boot/smoke/ui-smoke.ts`、`scene-smoke.ts`、`modal-click.ts` → `assets/game/smoke/`（修 import 深度；`scene-smoke` 中 `{ bundle: "ui", ... }` 用例保留，作为逻辑 bundle 名测试）；在 `assets/game/entry.ts` 的 `smokes` 中登记：`{ uiSmoke, sceneSmoke, modalClickSmoke }`。

- [ ] **Step 2: 迁移品类冒烟进 samples**

`assets/boot/smoke/card-battle.ts` → `assets/samples/game_card/smoke.ts`（内部改用 samples 注册的 fixtures）；`assets/boot/smoke/perf.ts` 的 `runFixturePerfSmoke` → samples（`sampleProfilerStats` 依赖 `cc`，保留在适配层或随冒烟迁入）；在 `assets/samples/entry.ts` 的 `smokes` 登记：`{ cardBattleSmoke, fixtureSmoke, fixturePerf }`。

- [ ] **Step 3: SmokeRouter 改为 bundle 映射**

`assets/boot/flow/SmokeRouter.ts` 的 `SmokeRouterDeps` 改为：

```ts
export interface SmokeRouterDeps {
    /** 按冒烟标识加载其所属 bundle 并运行：tag → { bundle, entry } 由分派表提供。 */
    readonly run: (bundle: string, entry: string) => Promise<void>;
}
export interface SmokeAction {
    readonly tag: string;
    readonly bundle: string;
    readonly entry: string;
    readonly run: () => Promise<void>;
}
```

`resolve` 返回含 `bundle`/`entry` 的 action；`run` 由 SmokeProxy 注入：`await provider.load(bundle, "placeholder"); await lookupBundle(bundle).smokes[entry]();`。

- [ ] **Step 4: 更新冒烟路由测试**

`tests/framework/foundation/boot-smoke-router.test.ts`：断言 `resolve("?smoke=card-battle")` 返回 `{ bundle: "samples", entry: "cardBattle" }`、`?smoke=scene-flow` 返回 `{ bundle: "game", entry: "sceneSmoke" }`、`?fixture=card` 返回 `{ bundle: "samples", entry: "fixture" }`。

- [ ] **Step 5: 验证**

Run: `bun run typecheck`
Expected: EXIT 0。

Run: `bun test ./tests/framework/foundation/boot-smoke-router.test.ts ./tests/framework/foundation/game-fixture-smoke.test.ts ./tests/framework/foundation/game-fixture-perf.test.ts`
Expected: 全部 PASS。

Run: `bun test ./tests/framework/foundation`（全量）
Expected: 全量 PASS。

Run: `bun run ccc build --platform web-desktop`
Expected: 构建成功；`assets/main/index.js` 不再含 `GameFixture`/`lobby`/`gameFixtureRegistry`（grep 校验）；game/samples 各自 index.js 独立。

Run: `bun run ccc scene-smoke`（及 `bun run ccc fixture --id card` 若 CLI 支持）
Expected: 冒烟经动态加载链路执行成功（game bundle → samples bundle → 注册 → 运行），`[scene-smoke] complete` 等标记出现。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: 冒烟系统重构为按 bundle 动态加载执行（URL 分派经注册桥）"
```

---

## 完成门禁

- `bun run typecheck` EXIT 0。
- `bun test ./tests/framework/foundation` 全量 PASS。
- `bun run test:foundation:types` EXIT 0。
- `bun run ccc build --platform web-desktop` 成功；`assets/main/config.json` scenes 仅含 `startup.scene`；game/samples 独立 index.js。
- grep 校验 `assets/main/index.js` 不含 `gameFixtureRegistry`/`createCardFixture`。
- `task68-scope-review.test.ts` 断言 boot 零 `game*` import 通过。
- 设计文档"风险与回退"已补 Task 3 spike 实测结论。
