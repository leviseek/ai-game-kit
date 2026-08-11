## Why

当前 FairyGUI Cocos 运行库以**直接 vendored** 方式存在于 `assets/framework/libs/fairygui/`（fairygui.mjs + fairygui.min.mjs + fairygui.d.ts + LICENSE + .meta），库代码混在主仓库历史中无独立版本可追溯；UBB 样式 bug（GTextField 不消费 `lastColor`）需修改运行库，原地修改会让"第三方库补丁"永久混入主仓库。用户已 fork 官方 `fairygui/FairyGUI-cocoscreator`（`ccc3.0` 分支）为 `leviseek/FairyGUI-cocoscreator`，需仓库化托管。

同时 Cocos 3.8 import-map 对 `assets/` 外 `.mjs` 的支持未获官方确认（experimental 特性、示例均限 assets 内、构建默认只打包 assets 内资源），故第三方库源码不能直接放 assets 外被 Cocos 引用。本方案用**双目录 + 构建导出脚本**化解：源码统一放根目录 `third-party/`（子模块，独立历史），构建产物导出到 `assets/framework/libs/`（Cocos 解析，保持现状兼容），并固化"源码 → 产物"的编译导出链路。

## What Changes

- 根目录新建统一第三方库目录 `third-party/`：`third-party/fairygui` 为 git submodule，指向用户 fork 的 `https://github.com/leviseek/FairyGUI-cocoscreator`（锁定 `ccc3.0` 分支）。日后其它第三方库子模块统一存放于此。
- 新增**编译导出脚本**（如 `scripts/build-fairygui.ts`，bun 运行）：从 `third-party/fairygui/source/dist/` 把 `fairygui.mjs` / `fairygui.min.mjs` / `fairygui.d.ts` / `LICENSE` 拷贝（或经构建后拷贝）到 `assets/framework/libs/fairygui/`，并在每次子模块更新/源码修改后执行。
- `assets/framework/libs/fairygui/` 保持为**构建产物目录**（Cocos 解析目标）：内容由导出脚本生成，import-map 指向 `./assets/framework/libs/fairygui/fairygui.mjs` 不变，`.meta`（GUID）在产物目录内保持稳定（脚本只覆盖内容不删 .meta）。
- 明确源码权威源（fork 仓库 `source/src/`）与产物目录（`assets/framework/libs/fairygui/`）的分工：改库改 fork 源码 → 构建 → 导出脚本 → 主仓库随产物提交。
- **不改变任何运行行为**：库内容字节不变（首次导出零 diff）、import-map 不变、Cocos 资源管线语义不变，纯托管与构建方式变更。

## Capabilities

### New Capabilities

（无——纯基建托管 + 构建脚本变更，无 spec 级行为变化，`skip_specs: true`）

### Modified Capabilities

（无）

## Impact

- 新增 `.gitmodules`：登记 `third-party/fairygui` → fork 仓库。
- 新增 `third-party/` 目录（根，统一第三方库子模块宿主）。
- 新增构建导出脚本（`scripts/` 或 `tools/`），注册到 `package.json` scripts（如 `build:fairygui`）。
- `assets/framework/libs/fairygui/` 从"直接 vendored"变为"构建产物"：由脚本生成，内容与 `third-party/fairygui/source/dist/` 保持一致；`.meta` 保留在产物目录稳定 GUID。
- 克隆/构建流程：新克隆需 `git submodule update --init` + `bun run build:fairygui`；纯 TS 门禁（`tsconfig.ci.json` 排除 `libs/fairygui`）不受影响。
- 后续 UBB 修复改 fork `source/src/GTextField.ts` → 构建 → 导出 → 指针/产物更新。
