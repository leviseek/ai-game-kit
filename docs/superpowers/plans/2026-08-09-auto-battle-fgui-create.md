# AutoBattle FGUI 战场页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `ui/demo` FGUI 工程中创建 `AutoBattle` 业务包及 1280x720 的 3v3 自动战斗战场页。

**Architecture:** 使用单个 `BattleView.xml` 承载完整页面，背景使用 palette 允许色生成的 sprite；6 个 `unit_i` 高级 group 作为静态槽位，绑定文本和 CommonProgressBar 通过 `group` 归属。按钮和进度条只跨包引用 Common。

**Tech Stack:** FGUI CocosCreator 5.0 XML、Bun、`tools/fgui` CLI、palette 约束 PNG sprite。

## Global Constraints

- 禁止 `<graph>` 和手写 `<transition>`。
- 包 id 固定为 `abpk0001`，资源短 id 使用 `next-id --prefix ab` 分配。
- 跨包引用只允许 `pkg="cmn00001"` 的 Common：`com00` 和 `com01`。
- 所有子元件 `name` 必须语义化并与 TS 清单完全一致。
- 字号只能使用 12/14/16/18/20/24/28/32/40。
- 单个 `<relation>` 的 `sidePair` 最多两项。
- 不修改 `.bin` 或 atlas；源 XML/PNG 完成后由 FGUI 编辑器发布。

### Task 1: 初始化 AutoBattle 包并分配资源 id

**Files:**

- Create: `ui/demo/assets/AutoBattle/package.xml`
- Create: `ui/demo/assets/AutoBattle/img/`

- [ ] **Step 1:** 创建最小包描述：`<packageDescription id="abpk0001"><resources/><publish name=""/></packageDescription>`。
- [ ] **Step 2:** 运行 `bun run fgui next-id --package AutoBattle --prefix ab`，记录连续分配的图片和组件 id，不手造短 id。
- [ ] **Step 3:** 确认 CLI 能识别 `AutoBattle` 包并输出包 id `abpk0001`。

### Task 2: 生成纯色背景 sprite 并登记资源

**Files:**

- Create: `ui/demo/assets/AutoBattle/img/bg_battle.png`
- Modify: `ui/demo/assets/AutoBattle/package.xml`

- [ ] **Step 1:** 使用 `bun run fgui sprite --package AutoBattle --name bg_battle.png --palette "ui/demo/palette.json" --art "#" --path img` 生成背景源图并幂等登记。
- [ ] **Step 2:** 确认登记路径与 XML 预期 `fileName="img/bg_battle.png"` 一致，颜色为 palette 的 `panel_dark`。

### Task 3: 创建 BattleView 组件

**Files:**

- Create: `ui/demo/assets/AutoBattle/BattleView.xml`
- Modify: `ui/demo/assets/AutoBattle/package.xml`

- [ ] **Step 1:** 用 `bun run fgui register-component --package AutoBattle --name BattleView.xml` 登记组件。
- [ ] **Step 2:** 生成 1280x720 XML：底层 `bg_battle`；敌方 `unit_3`/`unit_4`/`unit_5`；顶部 `txt_round`；左侧多行 `txt_log`；己方 `unit_0`/`unit_1`/`unit_2`；隐藏 `txt_result`；最后是 Common `btn_restart`。
- [ ] **Step 3:** 为每个单位写入对应 `txt_unit_i_name`、`txt_unit_i_hp`、`bar_unit_i_hp`、`bar_unit_i_energy`，并保证对象的 `group="unit_i"`、组件引用为 `pkg="cmn00001" src="com01"`。
- [ ] **Step 4:** 写入 CommonButton 引用 `pkg="cmn00001" src="com00"`，按钮标题为 `重新开始`。

### Task 4: 严格校验并修复

**Files:**

- Verify: `ui/demo/assets/AutoBattle/package.xml`
- Verify: `ui/demo/assets/AutoBattle/BattleView.xml`

- [ ] **Step 1:** 运行 `bun run fgui list-resources --package AutoBattle`，保存完整输出。
- [ ] **Step 2:** 运行 `bun run fgui validate --strict --package AutoBattle`。
- [ ] **Step 3:** 若有 error，依据真实资源 id、fileName、组件骨架、relation 限制或命名错误修复源文件，再重复两条命令直到无 error。
- [ ] **Step 4:** 复核 XML 不含 `graph`/`transition`，字号全部属于档位表，组件名清单与 TS 绑定逐项一致。

### Task 5: 交付复核

- [ ] **Step 1:** 汇总新增目录、package.xml、BattleView.xml 和生成 PNG。
- [ ] **Step 2:** 输出 `list-resources` 完整结果、`validate --strict` 结果和全部子元件 name。
- [ ] **Step 3:** 明确 FGUI 编辑器中需要人工确认的视觉微调、Common 包加载顺序以及 `.bin`/atlas 发布事项。
