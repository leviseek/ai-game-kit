# ADR-028 Third-Party Library Submodule Hosting

## 状态

Accepted

## 背景

FairyGUI Cocos 运行库此前以直接 vendored 方式存在于 `assets/framework/libs/fairygui/`（fairygui.mjs / fairygui.min.mjs / fairygui.d.ts / LICENSE + .meta），库代码混在主仓库历史中，无独立版本可追溯；UBB 样式 bug（GTextField 不消费 `lastColor`）需修改运行库，原地修改会让第三方库补丁永久混入主仓库，升级/回滚困难。官方 `fairygui/FairyGUI-cocoscreator`（`ccc3.0` 分支）未发布 npm release（有 `fairygui-cc@1.2.2` 但不维护），故此前走 vendor。用户已 fork 官方仓库为 `leviseek/FairyGUI-cocoscreator`。

同时 Cocos Creator 3.8 import-map 对 `assets/` 外 `.mjs` 的支持未获官方确认（experimental 特性、官方示例均限 assets 内、构建默认只打包 assets 内资源），第三方库源码不能直接放 assets 外被 Cocos 引用。

本 ADR 确立第三方库托管与产物导出的统一约定：源码子模块统一放根目录 `third-party/`（独立版本历史），构建产物导出到 `assets/framework/libs/`（Cocos 解析目录），用构建脚本桥接两者。

## 决策

### 1. 第三方库源码统一子模块目录 `third-party/`

根目录 `third-party/` 为第三方库子模块统一宿主：`third-party/fairygui` 为 git submodule 指向 fork 仓库（分支 `ccc3.0`），日后其它第三方库子模块统一存放于此。子模块源码与 Cocos 资源目录（`assets/`）彻底分离，避免 .meta 噪声与资源扫描干扰。

理由：统一目录管理第三方库来源与版本；与 assets 分离避免 Cocos 为子模块仓库结构（source/demo 等）生成非预期 .meta 与打包膨胀。备选（挂 assets 内）被否：Cocos 资源系统会扫描并管理其全部文件，产生大量非预期 .meta。

### 2. 构建产物导出目录保持 `assets/framework/libs/fairygui/`

`assets/framework/libs/fairygui/` 仍为 Cocos 解析目标：import-map `fairygui-cc` 指向 `./assets/framework/libs/fairygui/fairygui.mjs` 不变，`.mjs`/`.d.ts` 被 Cocos 识别为脚本资源并生成 .meta。该目录内容**由构建导出脚本生成**（不再是直接 vendored），脚本只写内容文件、不碰 `.meta`（GUID 由 Cocos 维持，防漂移）。

理由：Cocos 只解析并打包 assets 内 .mjs；产物目录保持现状路径，零 import-map 迁移、零 GUID 漂移。备选（import-map 指向 third-party 内 source/dist）被否：Cocos assets 外解析未获官方支持，风险高。

### 3. 构建导出脚本固化"源码 → 产物"链路

新增 `scripts/build-fairygui.ts`（`bun run build:fairygui`）：从 `third-party/fairygui/source/dist/` 同步 `fairygui.mjs` / `fairygui.min.mjs` / `fairygui.d.ts` / `LICENSE` 到产物目录。两条路径：纯同步（子模块 dist 已最新，默认）；源码修改后（改 fork `source/src` → 子模块 `npm run build` 产出新 dist → 脚本同步）。LICENSE 统一 LF 行尾（对齐仓库基线）。

理由：脚本是"改源码 → 产物落库"的唯一入口，避免手工拷贝漂移；Cocos 只解析产物目录，脚本保持薄适配层（复用官方 gulp 构建，不自研编译）。

### 4. 产物目录随主仓库提交

`assets/framework/libs/fairygui/` 内容提交到主仓库（对齐 FGUI bin/atlas 发布产物随源提交的先例）：克隆后即使未跑导出脚本也有可用产物；源码/产物双记录可追溯。`.meta` 随产物目录提交，GUID 稳定。

理由：Cocos 项目通常提交 assets 下资源；产物随提交保证克隆即可用、构建可复现。

## 理由

- 真源唯一：`third-party/fairygui/source/src` 是库源码权威源，`source/dist` 与 `assets/framework/libs` 都是其构建/同步产物。
- 可追溯：fork 仓库 + submodule 指针 = 任意 commit 级锁定；UBB 修复改 fork 源码独立提交，主仓库只 bump 指针。
- 零行为变化：库内容字节不变（首次导出零 diff）、import-map 不变、GUID 稳定。
- 可扩展：`third-party/` 是通用第三方库目录约定，新库照此模式（子模块 + 导出脚本 + `build:<lib>` script）。
- 协作可预期：README/排障文档记录 `--recursive` + `build:fairygui` 流程。

## 影响

- 新增 `.gitmodules`（`third-party/fairygui`）；根目录新增 `third-party/`。
- 新增 `scripts/build-fairygui.ts` + `package.json` `build:fairygui`；`eslint.config.mjs` 忽略 `third-party/**`。
- `assets/framework/libs/fairygui/` 从直接 vendored 变为构建产物目录（内容由脚本生成，.meta 稳定）。
- 克隆流程：`git clone --recursive` + `bun run build:fairygui`；文档与排障（`doc/troubleshooting/fairygui-submodule-build.md`）记录。
- 后续 UBB 修复（change）改 fork `source/src/GTextField.ts` → 构建 → 导出 → 指针/产物更新。
