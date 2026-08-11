## 1. 前置核实与备份

- [x] 1.1 核实 fork 仓库 `leviseek/FairyGUI-cocoscreator`：`ccc3.0` 分支 `source/dist/` 三件套齐全（fairygui.mjs 620735 / min.mjs 314528 / d.ts 91826）；`.gitignore` 忽略 `source/build/` 但**不忽略 dist**（dist 随仓库提交）；官方 dist 与本地 vendored **SHA256 完全一致**（三文件 MATCH），无版本落后；仅 LICENSE 有行尾差异（fork CRLF 1099 vs 本地 LF 1079，内容一致）。
- [x] 1.2 备份当前 `assets/framework/libs/fairygui/` 全部内容到临时目录；记录各文件 SHA256 与 .meta GUID 作为基准。
- [x] 1.3 确认 `.meta` GUID 清单：fairygui.mjs=b1e282d8 / min.mjs=b4356a01 / d.ts=c6e848cd / LICENSE=2c6229ce（迁移后须一致）。

## 2. third-party 目录与 submodule 挂载

- [x] 2.1 根目录 `git submodule add -b ccc3.0 https://github.com/leviseek/FairyGUI-cocoscreator third-party/fairygui`；`.gitmodules` 生成、路径 `third-party/fairygui`、分支 `ccc3.0` 正确（指针 cd19b70 = ccc3.0）。
- [x] 2.2 校验子模块 `source/dist/` 三文件与备份基准字节一致（MATCH）。
- [x] 2.3 记录第三方库目录约定到 README 与 `doc/troubleshooting/fairygui-submodule-build.md`（新库 → `third-party/<lib>` 子模块 + 导出脚本 + `build:<lib>`）。

## 3. 构建导出脚本

- [x] 3.1 新增 `scripts/build-fairygui.ts`：从 `third-party/fairygui/source/dist/` 同步 4 个内容文件到 `assets/framework/libs/fairygui/`；只写内容、不动 `.meta`；前置校验子模块已 init；LICENSE 统一 LF；输出 SHA256 摘要；幂等（重跑 hash 一致）。
- [x] 3.2 `package.json` 注册 `"build:fairygui"`；README/排障文档记录两条调用路径（纯同步 / 源码修改后先子模块 `npm run build` 再同步）。

## 4. 产物目录迁移

- [x] 4.1 跑 `bun run build:fairygui`：产物同步到 `assets/framework/libs/fairygui/`；内容与备份字节一致、`.meta` 从备份还原且 GUID 与 1.3 基准一致（MATCH）。
- [x] 4.2 主仓库移除旧直接 vendored 提交（`git rm` 旧文件）；产物目录保留（内容由脚本生成 + .meta 随提交）。

## 5. 文档与排障

- [x] 5.1 README 更新：快速开始加 `git submodule update --init` + `bun run build:fairygui`，目录树加 `third-party/`；新增 `doc/troubleshooting/fairygui-submodule-build.md`（子模块 init 报错、.meta 重导、产物漂移、LICENSE 行尾排障）。
- [x] 5.2 记录库更新流程（改 fork 源码 → 子模块构建 → 导出脚本 → 提交子仓库 → bump 指针）。

## 6. 集成验证

- [x] 6.1 `bun test` 全绿（1165 pass / 0 fail）；`typecheck:ci`、`lint`、`test:foundation:types` 通过。**注**：`bun run verify` 的 test:fgui-mcp 段会 spawn `fgui validate --package Basic --strict` 且 Basic（官方库）校验失败 exit 1——经 HEAD worktree 复现确认 **pre-existing**（AGENTS 约定 Basic/Builder 官方库默认豁免），非本 change 引入；fgui-mcp 测试自身 77 pass。
- [x] 6.2 Cocos 编辑器打开工程：无资源错误、`fairygui-cc` 解析正常、`.meta` GUID 与 1.3 基准一致。**已人工在 Cocos 编辑器验证通过**。
- [x] 6.3 `?smoke=auto-battle` 冒烟通过（库内容未变，行为应与仓库化前一致）。**已人工在 Cocos 编辑器验证通过**。
- [ ] 6.4 干净 clone 验证：**待提交后复验**（当前 submodule 改动未提交，本地 clone 无 submodule 记录；产物目录随提交可保证 clone 即用）。克隆流程 `git clone --recursive` + `bun run build:fairygui` 已文档化。

## 7. ADR 检查

- [x] 7.1 ADR 检查：第三方库托管演进为"根目录 `third-party/` 子模块 + 构建导出到 `assets/framework/libs/` 产物目录"是需记录的架构决策（统一目录约定 + 构建链路）——已创建 `doc/decisions/ADR-028-third-party-library-submodule-hosting.md`。
