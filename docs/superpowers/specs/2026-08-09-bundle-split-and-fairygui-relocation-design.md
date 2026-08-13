# 基础包 Bundle 拆分 + fairygui 迁移 framework 设计

日期：2026-08-09
状态：Approved（用户已确认 5 节设计）

## 背景与目标

当前 `assets/` 下除 `boot`、`framework`、`game*` 外的资源目录已配置为 Asset Bundle（`audio`、`common`、`game-content`、`ui`），但**全部游戏代码（`game/fixture`、`game/lobby`、`game_card` 等五类品类夹具）与 fairygui 运行时都静态编译进 main bundle**（已核实 `build/web-desktop/assets/main/index.js` 含 `GameFixture`、`lobby`、`gameFixtureRegistry`、`fairygui`）。

目标：

1. fairygui 从 `assets/third-party/` 迁入 `assets/framework/libs/`，framework 自含运行时依赖，`third-party` 目录删除。
2. `game`、`samples`（五类 game_* 合并）配置为独立 Asset Bundle，且 **boot 不再静态 import 任何 game 代码**，使基础包（首包 = boot + framework + 常驻 common/ui）完全不含品类示例代码与资源。
3. 为微信小游戏等平台的按需加载/分包打好结构基础（分包配置本次后置）。

## 关键事实（已核实）

- Cocos 3.x 将 Bundle 目录内脚本合并为独立 `index.js`，`loadBundle` 时加载；**跨 Bundle 脚本互相引用会导致"运行时找不到对应脚本"**（官方手册原话）。官方建议共享符号暴露到全局命名空间。
- `provider.load(bundle, path)` 底层即 `assetManager.loadBundle` + `bundle.load`：**加载 bundle 内任一资源即触发整个 bundle 脚本加载，脚本顶层代码随加载执行**。这是注册桥方案可行的根基。
- 当前 `boot/AppRoot`、`boot/host/GameLobbyHostImpl`、`boot/smoke/*` 静态 import `game/fixture/*`（lobby/catalog/sceneMap/smoke/perf），是 main 含全部 game 代码的直接原因。

## 目标目录结构

```
assets/
  boot/                main 包（非 bundle）— AppRoot/BootFlow/UiHost/冒烟 URL 分派外壳
  framework/           main 包（非 bundle）
    libs/fairygui/     ← fairygui.mjs/.min.mjs/.d.ts/LICENSE（自 third-party 迁入）
  game/                bundle "game" — lobby 编排、catalog、fixture 契约、game.scene、通用冒烟
  samples/             bundle "samples" — game_card/game_fight/game_idle/game_rpg/game_tycoon
  common/ ui/ audio/ game-content/   bundle（已有，不动）
  third-party/         → 删除
```

## 核心机制：全局 Bundle 模块注册桥

framework 新增 game 无关的全局注册桥 `framework/core/module/BundleModuleRegistry.ts`，存于 `globalThis` 私有符号键，跨 bundle 模块作用域共享（对齐 Cocos 官方"全局命名空间共享"建议）。

```ts
registerBundleModule(name, descriptor); // bundle 顶层副作用调用；幂等（重载时覆盖）
lookupBundleModule(name); // bundle 加载后查询
```

- **game bundle** 顶层副作用注册 `{ catalog, sceneResources, smokes }`。
- **samples bundle** 顶层副作用注册 `{ fixtures: { card, rpg, ... }, smokes }`；各 `game_*/assembly.ts` 顶层登记自己的夹具工厂，`gameFixtureRegistry` 从静态 import 改为运行时写入全局注册表。
- **main 侧**把 host 能力（UiHost/GameLobbyHostImpl 页面承载）反向经桥注入 game bundle，把 boot→game 依赖反向为 game→main。
- **catalog 去耦合**：`catalog.ts` 不再 import `game_card/models`，路由常量字面量化。
- **唯一静态引导常量**：main 保留 `BOOTSTRAP_SCENE = { game: { bundle: "game", paths: ["game"] } }`（必须先知道入口场景才能加载第一个 bundle，属配置非代码）。

## 具体改动清单

### P1 fairygui 移入 framework（独立、低风险）

- `assets/third-party/fairygui/*`（含全部 `.meta`，保 UUID）→ `assets/framework/libs/fairygui/`
- 删除 `assets/third-party/`（含 `third-party.meta`）
- `import-map.json`：`fairygui-cc` → `./assets/framework/libs/fairygui/fairygui.mjs`
- `settings/v2/packages/project.json` 的 `script.importMap` 不变（仍 `project://import-map.json`）
- 更新 ADR-011 决策 3（vendor 落点变更）

### P2 目录重构 + 注册桥

- 新增 `framework/core/module/BundleModuleRegistry.ts` 与单元测试；framework index 导出 → 同步更新 `tests/scripts/check-foundation-contracts.ts` 的 `expectedRootExports` 白名单
- `assets/game.meta`、新 `assets/samples.meta` 设 `userData.isBundle: true`
- 五个 `game_*` 目录（含 `.meta`，保 UUID）移入 `assets/samples/`；内部 `../../framework` → `../../../framework`
- `samples` bundle 补一个占位资源 `assets/samples/placeholder.json`（对齐 `common/ui/game-content` 既有模式），作为 `provider.load("samples", "placeholder")` 的加载哨兵（触发整个 bundle 脚本加载）
- `game_fight/logic/audio.ts`、`game_fight/logic/resource.ts`：硬编码 `"fight"` → `"samples"`

### P3 game bundle 改造

- `game/fixture/scene.ts`：`bundle: "ui"` → `bundle: "game"`，paths `["game"]`（game.scene 即加载哨兵）
- `game/fixture/registry.ts`：静态 import 五类 → 运行时自注册；各 `game_*/assembly.ts` 顶层副作用登记夹具工厂
- `game/lobby/catalog.ts`：去掉 `game_card/models` 静态 import（路由常量字面量化）
- 新增 `game/entry.ts`：顶层 `registerBundleModule("game", { catalog, sceneResources, smokes })`
- 通用冒烟 `ui-smoke/scene-smoke/modal-click` 从 `boot/smoke` 迁入 `game/smoke/`；`fixture/smoke.ts`、`perf.ts` 中依赖 `game_card` 的部分迁入 samples

### P4 boot 解耦（关键）

- `boot/AppRoot.ts`：删除 `../game/fixture/lobby` 静态 import；`sceneMap`/catalog 改从注册桥读；host 能力经桥反向注入
- `boot/flow/BootFlow.ts`：`sceneMap` 依赖改为动态源；main 保留 `BOOTSTRAP_SCENE` 静态引导常量
- `boot/host/GameLobbyHostImpl.ts`：运行时符号改从桥取（纯类型 import 保留）
- `boot/smoke/smoke-proxy.ts` + `SmokeRouter`：URL 冒烟 tag → `{ bundle, entry }` 映射，先 `provider.load(所属 bundle 哨兵资源)` 再 `lookupBundleModule(bundle).smokes[entry]()`
- `boot/smoke/card-battle.ts`、`perf.ts` → 迁入 samples 并自注册

## 边界与约束

- 延续 ADR-005（framework 不依赖 game）、ADR-018（品类目录即 bundle 边界）、ADR-020（lobby 属游戏层、AppRoot 只做宿主注入）；本次把 ADR-018 的"独立 Bundle 按需加载"从目录预留落地为运行时注册机制。
- `framework/core` + `contracts` 允许新增注册桥模块（新能力），不修改既有内核行为。
- boot 不得静态 import `game*`（新增 scope-review 断言机械锁定）。
- samples 只能以 `import type` 引用 game 契约（运行时擦除），运行时经注册桥交互。
- 分包（压缩类型 = 小游戏分包）本次后置，仅建 bundle 结构。

## 验证方式

- `bun run typecheck`（strict 全量）
- `bun test ./tests/framework/foundation`（既有不回归）+ 注册桥/自注册新测试 + boot 不 import game 的 scope-review 断言
- `bun run ccc build --platform web-desktop`：构建日志确认 game/samples 各自 `index.js`、main 不再含 `GameFixture`/`lobby`/`gameFixtureRegistry`、无跨 bundle 脚本警告
- 冒烟：`bun run ccc scene-smoke` 等确认动态加载链路（game bundle → samples bundle → 注册 → 运行）
- 产物核对：`assets/main/config.json` scenes 仅留 `startup.scene`；`assets/game/`、`assets/samples/` 独立 index.js

## 分阶段实施

- 阶段 A：P1 fairygui 迁移（独立可验证，先落）
- 阶段 B：P2 注册桥 + samples 目录合并
- 阶段 C：P3 game bundle 改造
- 阶段 D：P4 boot 解耦 + 冒烟重构
- 每阶段跑 typecheck + 对应单测；阶段 D 后全量构建与冒烟

## 风险与回退

- 跨 bundle 脚本引用的真实构建行为（3.8 是警告重复打进还是报错）以阶段 B/C 实测构建日志为准；若 samples 契约类型 import 触发构建器抱怨，改在 samples 内独立内联契约类型。
- **实测结论（Task 3 spike，web-desktop 3.8.8）**：bundle 脚本静态 import main（framework）代码时，Cocos 3.8 构建为**共享 main**，不重复打进 bundle chunk。证据：临时 `_spike_bundle`（`spike.ts` 静态 `import { createStateMachine } from "../framework"`）构建后其 `index.js` 仅 1333 字节，只含 bundle 包装器与 `spike.ts` 自身模块，`System.register` 对 `createStateMachine` 以 `./index6.ts`/`./StateMachine.ts` 两个 chunk id 引用；这两个 chunk 的 `System.register` 定义位于 `build/web-desktop/assets/main/index.js`（main 含完整 `createStateMachine` 实现与转移表处理，main/index.js 1.66MB）。构建日志无跨 bundle 脚本警告/报错（仅 2 条非失败 BABEL deoptimise 警告）。⇒ samples/game bundle 内代码可安全静态 import framework，无需把 fixture 的 framework 依赖面最小化。
- 全局桥属跨 bundle 运行时约定，重命名/清空语义需固化（`register` 幂等、`lookup` 只在加载后调用），避免隐式时序耦合。
- 阶段 A 独立可回退；阶段 B/C/D 为结构性改动，逐阶段构建验证后推进。
