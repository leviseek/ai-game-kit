# ai-game-kit

面向 Cocos Creator 3.8.8 的 TypeScript 游戏框架与工具包。以 AI 协作优先：严格分层、稳定契约、OpenSpec 流程驱动，配套确定性 FGUI / Creator 命令行工具链。

## 环境要求

- [Bun](https://bun.sh) ≥ 1.3（运行时与包管理器）
- Cocos Creator 3.8.8（本地构建/冒烟需要；纯类型检查与测试不需要）
- FairyGUI 编辑器（FGUI 组件源发布需要）
- `openspec` CLI（全局命令，change 生命周期使用）

`test:foundation:types` 与 `ccc` 相关命令依赖 Cocos Creator 安装路径：优先读取环境变量 `COCOS_CREATOR_HOME`（指向 Creator 安装根目录），未设置时回退到内置默认路径。

## 快速开始

```sh
git submodule update --init --recursive   # 首次拉取第三方库子模块（third-party/）
bun install
bun run build:fairygui                    # 同步 FairyGUI 库产物到 assets/framework/libs
bun run typecheck
bun run test
```

> 第三方库子模块统一存根目录 `third-party/`（当前含 `fairygui`）。产物由
> `bun run build:fairygui` 从子模块 `source/dist/` 同步到 `assets/framework/libs/fairygui/`
> （Cocos 解析目录，import-map 指向不变）。新克隆须先 init 子模块，否则构建脚本会报错。

## 门禁命令

| 命令 | 内容 | 需要 Cocos |
| --- | --- | --- |
| `bun run typecheck` | 三个 TS 工程（根 / `tools/creator` / `tools/fgui`）严格类型检查（含 Cocos 边界层，需本机 Creator 生成的 `temp/tsconfig.cocos.json`） | 是 |
| `bun run typecheck:ci` | 引擎无关类型检查：`tsconfig.ci.json`（framework 除 cocos 适配层、game、samples）+ 两个 tools 工程 | 否 |
| `bun run lint` | ESLint（typescript-eslint recommended，非 type-aware）全仓检查 | 否 |
| `bun run test` | `test:foundation`（843）+ `test:fgui`（76） | 否 |
| `bun run test:all` | 追加 `test:foundation:types`（framework 契约 + fairygui 接入类型检查） | 是 |
| `bun run verify` | `typecheck` + `lint` + `test`，提交前完整门禁 | 否 |
| `bun run fgui <command>` | FGUI 确定性工具链（资源清单/校验/短 id 等） | 否 |
| `bun run ccc <command>` | Creator 命令行工具（构建/smoke/性能检查等） | 是 |

测试计数会随代码演进，以实际输出为准。

## 可玩品类与冒烟

- **卡牌对战**（`game_card`，炉石式回合制卡牌）：Cocos 预览 `?smoke=card-battle` 驱动完整对局。
- **自动战斗**（`game_auto_battle`，我叫MT/刀塔传奇式多单位自动战斗）：双方 3v3 阵列按速度自动行动、能量积满自动放技能、前排优先目标选择、胜负终局与重开；Cocos 预览 `?smoke=auto-battle` 冒烟驱动完整对局到终局。开打前需在 FGUI 编辑器中发布 `AutoBattle` 包（生成 `assets/ui/AutoBattle/*.bin` 与 atlas），并确保运行时先注册 Common 包。

## CI

`.github/workflows/pure-ts-gate.yml` 提供纯 TypeScript 门禁层（Layer 1）：`push` / `pull_request` 自动运行，覆盖引擎无关 typecheck（`typecheck:ci`，Cocos 边界层由本机 Creator 环境校验）、lint、foundation/fgui 测试、FGUI 源工程校验（`fgui validate --strict`）与 OpenSpec specs 校验。零 Creator 授权、零引擎依赖，可在 `ubuntu-latest` 全跑。依赖 Cocos Creator 的构建/smoke（`ccc`）不在本层。

## 目录地图

```
assets/
  boot/               组合根（AppRoot、assembleApp）
  framework/          框架本体：core（纯 TS 内核）→ contracts（稳定契约）→ application/diagnostics → adapters（cocos/memory）→ libs（fairygui）
  game/               品类夹具公共契约（GameFixture）与登记
  game_*/             五类组合夹具（card/fight/idle/rpg/tycoon）
tools/
  fgui/               FGUI 确定性工具（含独立测试）
  creator/            Cocos Creator 命令行工具
tests/
  framework/          foundation 测试与契约类型检查
openspec/             OpenSpec 变更（changes / specs / decisions）
doc/                  framework-guide 与 ADR 决策记录
ui/                   FairyGUI 源工程（assets/ 引用其发布产物）
third-party/          第三方库子模块统一目录（当前：fairygui → leviseek/FairyGUI-cocoscreator）
```

框架分层与依赖规则见 `doc/framework-guide.md`；决策记录见 `doc/decisions/ADR-*.md`。

## AI 协作约定

- 项目级规则：`AGENTS.md`（FGUI 工作流、注释语言、validate 语义）
- AI 行为约束：`.ai/instructions.md`（14 条硬规则；第 3 条豁免 devDependency 工具链）
- lint 策略：`eslint.config.mjs`（typescript-eslint recommended，非 type-aware）；`_` 前缀变量与 `*.typecheck.ts` 豁免 `no-unused-vars`
- OpenSpec 流程按 `openspec/config.yaml` 执行
