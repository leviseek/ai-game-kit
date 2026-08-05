# ADR-011 FairyGUI Runtime Introduction and Compatibility Spike

## 状态

Accepted

## 背景

`implement-fairygui-ui-adapter-v1` change 以 spike 门禁前置 FairyGUI Runtime 引入验证（设计决策 1）。FairyGUI 是仓库第一个外部运行时依赖，引入前必须确认版本、来源、License、包体与 Cocos Creator 3.8.8 兼容性，未通过则本 Change 不进入正式实现。本 ADR 记录 spike Task 0 的结论，作为后续 Adapter 实现的版本基准与兼容依据。

## 决策

### 1. 冻结 FairyGUI Runtime 版本为 fairygui-cc 1.2.2

来源为官方 GitHub `fairygui/FairyGUI-cocoscreator`（默认分支 `ccc3.0`，README 明确适用于 Cocos Creator 3.4+）经官方 npm registry 发布的 `fairygui-cc` 包（2024-05-21 发布，npm 最新版，无更新 release）。vendor 文件与 `ccc_lab` 参考项目 node_modules 中的同一版本逐字节 SHA-256 一致，来源可复核。

**理由：** README 版本矩阵确认 ccc3.0 分支支持 Creator 3.4+（含 3.8.8）；npm 包即该分支编译产物，`ccc_lab`（Creator 3.8.8 项目）已在用并正常运行。版本冻结避免隐式漂移。

**未采用方案：** 不直接拷贝 GitHub 源码（需要构建链，不可复核）；不在 spike 阶段升级 Creator 或 FairyGUI 版本。

### 2. License 为 MIT，允许目标分发方式

官方仓库 LICENSE 为 MIT（Copyright (c) 2015 fairygui.com）。MIT 无编辑器 vs Runtime 之分、无商业授权限制，允许修改、分发、商用与再分发；vendor 目录已包含 LICENSE 原文。

**理由：** 这是唯一可能推翻 ADR-002 的风险点，spike 0.2 前置核对后确认条款允许本项目目标分发方式（商业游戏内嵌运行时）。

**未采用方案：** 无需为 Runtime 购买商业授权（MIT 覆盖）；不采用 FairyGUI 官方站点可能提供的其他授权文本作为 vendor 依据（以仓库 LICENSE 为准）。

### 3. vendor 到 `assets/third-party/fairygui`，经 import-map 接入

SDK 文件（`fairygui.mjs`、`fairygui.min.mjs`、`fairygui.d.ts`）与 LICENSE vendor 到 `assets/third-party/fairygui`（与 `library`/`temp` 生成目录隔离）。项目根 `import-map.json` 将裸包名 `fairygui-cc` 映射到该 `.mjs`；`settings/v2/packages/project.json` 的 `script.importMap` 声明为 `project://import-map.json` 使 Creator 编程系统采用该映射。`fairygui.d.ts` 是 dts-bundle 产物（ambient 模块声明），被 Creator 识别为 typescript 资源，strict 类型检查通过。

**理由：** 保持代码以官方裸包名 `fairygui-cc` 导入（与官方 demo/ccc_lab 一致），运行时与类型均经 Creator 原生机制解析，无需 npm 依赖、无需改任何 `cc` 导入；vendor 方式符合项目"不引入 npm 依赖"纪律且可审计。

**未采用方案：** 不引入 npm 包（违反项目纪律）；不把 `.d.ts` 重写为相对导入模块（破坏 dts-bundle 结构，无法维护）。

### 4. 兼容矩阵：Creator 3.8.8 Web Desktop 通过，import-map 配置需 project:// 形式

- Creator 3.8.8 将 `.mjs` 识别为 javascript 脚本资源、`.d.ts` 识别为 typescript 类型资源，均自动生成 meta。
- `script.importMap` 必须写 `project://import-map.json`；写成绝对路径时编程系统静默降级（`foo:/bar`），裸包名解析失败且无报错。
- import-map 配置变更后需重启 Creator 才生效。
- 类型检查：`fairygui-cc` 裸包名在 strict 下解析 `GRoot`/`UIPackage`/`GComponent`/`GObject`/`UIConfig` 等无错误（Creator tsc，EXIT 0）。
- Web Desktop 构建通过（约 12-43s）；fairygui 被引用时打包进 `assets/main/index.js`，无编译错误（BABEL 对 >500KB 文件仅提示 deoptimise，非失败）。
- 最小运行验证通过（headless Chrome + CDP）：`GRoot.create` 成功（1280x960）、`UIPackage.createObject("","")` 返回 null（未加载 package 时 no-op）、`GComponent` 添加/移除/销毁闭环、`UIConfig` 加载无异常、零控制台错误。

**理由：** 上述验证覆盖 0.3/0.4 全部门禁项，证明 FairyGUI Runtime 与 Creator 3.8.8 Web Desktop 兼容且运行时链路可用。

**未采用方案：** 不在 spike 验证原生/小游戏平台（留给后续 change）；不预建多平台适配矩阵。

### 5. 包体与启动基线（记录，供 9.5 性能检查比对）

- Web Desktop debug 构建总包体约 7.51 MB；`assets/main/index.js`（含 fairygui）约 1.26 MB；引擎 `_virtual_cc` 约 5.26 MB。
- 启动基线（headless Chrome）：Init Base 2.7ms、Init Infrastructure 18.5ms、Init SubSystem 35.8ms、Init Project 41.5ms、LoadScene（spike-smoke）17.8ms。
- vendor 文件：`fairygui.mjs` 620,735 B、`fairygui.min.mjs` 314,528 B、`fairygui.d.ts` 91,826 B、LICENSE 1,079 B。

**理由：** spike 0.4 要求记录包体与启动时间基线；fairygui 未单独分包（随 main bundle 打包），后续 Adapter 若需分包可作为独立优化项。

**未采用方案：** 不在 spike 阶段做体积优化（无证据驱动）；不单独拆分 fairygui chunk。

## 理由

- FairyGUI 是首个外部运行时依赖，版本/来源/License/包体/平台兼容性是最大不确定性，spike 前置验证避免 Adapter 返工（design 决策 1）。
- import-map 接入方式是本 spike 发现的关键机制：裸包名映射到 vendor 文件，代码保持官方导入写法，`core`/`contracts` 可保持零 `fgui` 导入（后续 task68 断言继续生效）。
- `project://` 形式要求是易错点，记录防止后续误配置导致静默降级。

## 影响

- FairyGUI Runtime 版本冻结为 `fairygui-cc@1.2.2`，后续升级需独立 change 验证。
- `assets/third-party/fairygui` 为 vendor 目录（含 LICENSE）；`import-map.json` 与 `settings/v2/packages/project.json` 的 `script.importMap` 为持久配置。
- 后续 Task 1-4 以本 spike 结论为基准：资源层扩展 `fairygui-package` 加载、UI 根宿主、页面适配器均按 `import { ... } from "fairygui-cc"` 编写（仅 Adapter 边界）。
- 冒烟验证复用 headless Chrome + CDP 模式（本 spike 已验证可用）。
- spike 临时验证文件（spike-smoke.scene、SpikeFairyGuiSmoke.ts）已清理，不进入仓库。
