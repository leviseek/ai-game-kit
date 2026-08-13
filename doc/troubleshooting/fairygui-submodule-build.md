# FairyGUI 子模块与构建导出排障

本文记录第三方库子模块（`third-party/`）与 FairyGUI 产物导出链路（`bun run build:fairygui`）的约定与常见问题。

## 背景

FairyGUI Cocos 运行库源码以 git submodule 存放于根目录 `third-party/fairygui`（指向 fork `leviseek/FairyGUI-cocoscreator`，分支 `ccc3.0`），版本历史独立、可 cherry-pick 官方上游。Cocos Creator 只解析并打包 `assets/` 内资源，故库产物经 `scripts/build-fairygui.ts` 同步到 `assets/framework/libs/fairygui/`（import-map `fairygui-cc` 指向 `./assets/framework/libs/fairygui/fairygui.mjs`，保持不变）。

## 目录分工

| 目录                                | 角色                  | 变更来源                                           |
| ----------------------------------- | --------------------- | -------------------------------------------------- |
| `third-party/fairygui/source/src/`  | 库源码权威源（TS）    | fork 仓库提交                                      |
| `third-party/fairygui/source/dist/` | 构建产物（官方 gulp） | fork 仓库提交（或源码修改后 `npm run build`）      |
| `assets/framework/libs/fairygui/`   | Cocos 解析产物目录    | `bun run build:fairygui`（只写内容，不碰 `.meta`） |

## 常用命令

```sh
git submodule update --init --recursive   # 首次/重装后拉取子模块
bun run build:fairygui                    # 从子模块 dist 同步产物到 assets 目录
```

修改库源码流程：改 `third-party/fairygui/source/src/GTextField.ts` → 子模块内
`npm install && npm run build`（官方 gulp 产出新 dist）→ 主仓库 `bun run build:fairygui`
→ 提交 fork 仓库 → 主仓库更新子模块指针。

## 新增第三方库子模块

```sh
git submodule add -b <branch> <url> third-party/<lib>
# 新建对应导出脚本 scripts/build-<lib>.ts + package.json 注册 build:<lib>
# README 目录树与文档补充约定
```

## 常见问题

### 构建脚本报错：子模块产物目录不存在

`[build:fairygui] 子模块产物目录不存在: third-party/fairygui/source/dist`

原因：`third-party/` 未初始化子模块（新克隆未加 `--recursive`，或仓库里子模块目录为空）。

处理：`git submodule update --init --recursive` 后重跑 `bun run build:fairygui`。

### 产物目录 .meta 被 Cocos 重导

`assets/framework/libs/fairygui/*.meta` 由 Cocos 维护 GUID。脚本只同步内容文件，
不动 `.meta`；正常场景 GUID 保持稳定。若 Cocos 编辑器对产物文件重导（如内容被
外部修改触发重新导入），核对 GUID 是否漂移——漂移会导致 `fairygui-cc` 引用错乱，
此时需比对 `doc/decisions/ADR-*` 记录的基准 GUID 并恢复。

### 产物与子模块 dist 漂移

修改了 fork 源码但忘了跑 `bun run build:fairygui`，或跑了脚本但没提交产物。
处理：重跑 `bun run build:fairygui`，核对输出 hash 摘要与子模块 `source/dist/` 一致后提交。

### LICENSE 行尾

第三方库仓库的 LICENSE 可能是 CRLF；产物目录统一为 LF（脚本 `normalizeLf`），
对齐仓库 `.gitattributes` 基线，避免每次导出产生无意义 diff。
