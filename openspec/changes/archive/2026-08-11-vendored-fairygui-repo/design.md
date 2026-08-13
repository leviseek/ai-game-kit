## Context

现状 FairyGUI Cocos 运行库 vendored 在 `assets/framework/libs/fairygui/`（fairygui.mjs 620KB / fairygui.min.mjs 314KB / fairygui.d.ts 91KB / LICENSE + .meta）。import-map `"fairygui-cc": "./assets/framework/libs/fairygui/fairygui.mjs"`。官方 `fairygui/FairyGUI-cocoscreator` `ccc3.0` 分支：源码 `source/src/`（TS，package.json main=dist/fairygui.mjs），构建产物 `source/dist/` 三件套；已核实官方 dist 与本地 vendored 字节一致（617919），官方**未修复** UBB bug。用户 fork：`leviseek/FairyGUI-cocoscreator`（ccc3.0，149 commits）。**Cocos 3.8 import-map 对 assets 外 `.mjs` 支持未获官方确认**（experimental、示例均 assets 内、构建默认只打包 assets 内资源），故源码不能直接放 assets 外被 Cocos 引用。见 proposal.md - Why（纯基建，skip_specs）。

## Goals / Non-Goals

**Goals:**

- 统一第三方库子模块目录 `third-party/`（根，未来其它库复用），fairygui 为其首个成员。
- 构建导出脚本固化"子模块源码 → assets 产物"链路，保持 Cocos 解析兼容（import-map 不变）。
- 库获得独立版本历史（fork 仓库 + submodule 指针）；UBB 修复在 fork 源码完成。

**Non-Goals:**

- 不改库代码（UBB 修复是后续独立 change）。
- 不迁移到 npm 包（Cocos 对 node_modules+.mjs 支持未验证，库稳定前不做）。
- 不删除 `fairygui.min.mjs`（产物随官方 dist 三件套维护，减负留待库稳定后评估）。
- 不在本 change 内做 UBB 修复。

## Decisions

### 决策 1：源码统一目录 `third-party/`（根）+ submodule 挂载

根目录新建 `third-party/`，`third-party/fairygui` 为 submodule 指向 fork 仓库（分支 `ccc3.0`）。理由：

- 满足"日后第三方库子模块统一存放"——一个目录容纳多个第三方库子模块（fairygui、未来其它）。
- 与 `assets/` 彻底分离：子模块内源码/构建产物不混入 Cocos 资源目录，避免 .meta 噪声与资源扫描干扰。
- 第三方库源码有独立版本历史，主仓库只记录 submodule 指针。

备选（挂 assets 内）被否：Cocos 会为 assets 内所有文件生成 .meta 并纳入资源管线，子模块仓库结构（source/demo 等）会被 Cocos 资源系统扫描，产生大量非预期 .meta 且打包膨胀。

### 决策 2：构建产物目录 `assets/framework/libs/fairygui/` 保持 Cocos 解析

`assets/framework/libs/fairygui/` 仍是 Cocos 解析目标：import-map 继续指向 `./assets/framework/libs/fairygui/fairygui.mjs`，`.mjs`/`.d.ts` 被 Cocos 识别为脚本资源并生成 .meta。本 change 之后该目录内容**由构建导出脚本生成**，不再是直接 vendored。

- **脚本只覆盖内容文件，不删 `.meta`**：fairygui.mjs.meta / fairygui.min.mjs.meta / fairygui.d.ts.meta / LICENSE.meta 的 GUID 由 Cocos 生成并保留在产物目录（首次导出保留现状 .meta），脚本只同步 mjs/min.mjs/d.ts/LICENSE 本体，保证 GUID 稳定、Cocos 引用不漂移。
- 产物目录内容提交到主仓库（对齐 FGUI bin/atlas 发布产物随源提交的先例）：克隆后即使未跑导出脚本也有可用产物；源码/产物双记录可追溯。

理由：Cocos 只解析 assets 内 .mjs；产物目录保持现状路径，零 import-map 迁移、零 GUID 漂移。备选（import-map 指向 third-party 内 source/dist）被否：Cocos assets 外解析未获官方支持，风险高。

### 决策 3：构建导出脚本固化"源码 → 产物"链路

新增 `scripts/build-fairygui.ts`（bun 运行，注册 `package.json` `"build:fairygui"`）：

```ts
// 从 third-party/fairygui/source/dist/ 同步产物到 assets/framework/libs/fairygui/
```

职责：

- 校验 `third-party/fairygui/source/dist/` 存在（子模块已 init）。
- 拷贝 `fairygui.mjs` / `fairygui.min.mjs` / `fairygui.d.ts` / `LICENSE`（或按需先跑子模块内 `gulp build` 再拷贝）到产物目录。
- 只写内容文件，不动 `.meta`；输出同步摘要（源/目标/字节/hash）。

两条调用路径：

- **纯同步**（默认）：子模块 dist 已是最新（官方/自己提交了 dist），直接拷贝——首次挂载零 diff。
- **源码修改后**（如 UBB 修复）：在子模块内改 `source/src` → 子模块内 `npm run build`（官方 gulp）产出新 dist → 本脚本同步到产物目录。

理由：Cocos 只解析产物目录；脚本是"改源码→产物落库"的唯一入口，避免手工拷贝漂移。备选（脚本内置编译子模块 TS）被否：官方已有 gulp 构建，复用即可，脚本保持薄适配层。

### 决策 4：`.meta` 稳定与 GUID 防漂移

产物目录 `.meta` 文件（4 个）**不随脚本覆盖**，由 Cocos 在首次打开时生成/维持；脚本只同步内容文件。首次迁移时保留现状 .meta（GUID 不变）。子模块内不引入 .meta（Cocos 不扫 third-party）。

理由：GUID 漂移会导致已发布 UI/引用错乱；脚本与 Cocos 各管其域（脚本管内容、Cocos 管 .meta）。

### 决策 5：克隆/构建流程文档化

新克隆流程：`git clone --recursive`（或 `git submodule update --init`）→ `bun run build:fairygui`（首次需要，产物已随仓库提交则可选）。README / `docs/troubleshooting/` 记录：

- submodule init 命令与"third-party/ 未 init 时 build:fairygui 报错"排障。
- 第三方库统一目录约定：新库 → `third-party/<lib>` 子模块 + 对应导出脚本 + `build:<lib>` script。

理由：这是对协作流程的唯一可见影响；第三库目录是通用约定，需文档沉淀。

## Risks / Trade-offs

- [Cocos 扫描 `assets/framework/libs/fairygui` 产物目录并可能重生成 .meta] → 脚本只写内容；验收比对 .meta GUID 前后一致；异常则记录排障（Cocos 资源重导属于预期行为，GUID 通常保持）。
- [submodule 未 init 时构建/冒烟失败] → build:fairygui 前置校验 third-party 存在并给出清晰报错；README 记录 --recursive 约定。
- [产物目录与子模块 dist 漂移（忘了跑脚本）] → 脚本输出 hash 摘要；验收/CI 可加一致性检查（比对产物与子模块 dist hash，漂移则失败）。
- [gulp 构建依赖 node 环境（子模块内 npm install）] → 纯同步路径不依赖 gulp；源码修改路径需在子模块安装依赖，文档记录。
- [Windows 路径/换行（CRLF）] → 产物用 LF（对齐 .gitattributes）；脚本显式处理换行，避免构建产物 CRLF 漂移。

## Migration Plan

1. 备份当前 `assets/framework/libs/fairygui/`（含 .meta），记录各文件 SHA256 与 GUID 作为基准。
2. 根目录 `git submodule add -b ccc3.0 https://github.com/leviseek/FairyGUI-cocoscreator third-party/fairygui`。
3. 新增 `scripts/build-fairygui.ts` + `package.json` script。
4. 跑 `bun run build:fairygui`：产物同步到 `assets/framework/libs/fairygui/`，比对与备份字节一致（零 diff），.meta 不动。
5. 主仓库提交 `.gitmodules` + third-party 子模块指针 + 脚本 + 产物（原 vendored 内容移交产物目录）。
6. 验证：`bun run verify` + Cocos 打开无资源错误 + 冒烟；干净 clone 验证流程。

回滚：`git revert` 主仓库提交 → third-party 移除、产物目录恢复原 vendored 文件（内容未变，.meta 保留）。

## Open Questions

- fork 仓库 `.gitignore` 是否忽略 `.meta`/dist？（子模块仓库独立，主项目不依赖其 .meta，但确认 dist 是否随仓库提交，决定纯同步是否足够。）
- 是否需要把 `build:fairygui` 纳入 CI 一致性检查（产物 hash == 子模块 dist hash）？（可选增强，实施时评估。）
- Cocos 打开后是否会对产物目录 .meta 做重导（GUID 保持还是重新生成）？（验收时编辑器确认。）
