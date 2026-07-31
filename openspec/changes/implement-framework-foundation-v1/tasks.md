## 1. 验证基线与目录边界

- [x] 1.1 记录 Bun、Node 和可用测试运行器现状，确认 Bun 可直接执行 TypeScript 且无需新增依赖；建立可重复执行的 Bun foundation 测试命令，并用最小失败测试证明门禁生效。
  - 基线：Bun 1.3.13、Node.js v24.15.0；项目未安装 Vitest、Jest、tsx、ts-node 或独立 tsc，使用 `bun:test` 无需新增依赖或 lockfile。
  - 命令：`bun run test:foundation`，仅扫描仓库级 `tests/framework/foundation`，不进入 Cocos `assets` 导入范围。
  - 门禁证据：受控失败断言得到 0 pass / 1 fail 与退出码 1；修正后得到 1 pass / 0 fail 与退出码 0。
- [x] 1.2 按 design.md 建立 `core`、`contracts`、`application`、`diagnostics/logging` 和 `adapters/cocos/application` 目录，不创建 UI、resource、scene、ECS 或 game 业务目录。
  - 已建立 `core/errors`、`core/lifecycle`、`contracts/application`、`contracts/module`、`contracts/logging`、`application`、`diagnostics/logging` 和 `adapters/cocos/application`；空目录不加入 `.gitkeep` 等占位文件。
- [x] 1.3 建立 `assets/framework/index.ts` 的最小公开入口和导入边界测试，先证明跨模块深层导入会被检查发现。
  - RED：边界检测用例能识别合成的 Framework 深层导入，根入口缺失断言失败；GREEN：新增根入口后边界测试 3 pass / 0 fail，未暴露任何尚未实现的契约。
- [x] 1.4 补强 Foundation 架构测试：扫描 `assets` 下除 Framework 外的全部 TypeScript 消费者，并为 `core -> contracts -> application -> adapters/cocos` 建立内部 import allowlist；覆盖合法根导入、非法深层导入、core 禁止依赖 `cc`、contracts 禁止依赖实现、application/Framework 禁止依赖 Game，且不引入第三方依赖分析库。
  - RED：新增 `contracts/module -> application/ApplicationContext` 反向依赖断言后，旧门禁返回空违规集合并以 1 fail 证明缺口。
  - GREEN：使用 Bun 内置 TypeScript import scanner 与仓库内补充分析覆盖 static/type/dynamic import、require、import-equals、相对路径、`db://assets` 和 `@framework`/`@game` alias；边界测试 8 pass / 0 fail，未新增依赖。
- [x] 1.5 通过 Cocos Creator 导入新增 assets 文件并生成 `.meta`，检查没有手工复制 UUID、没有改动 `library`、`temp` 或 `profiles`。
  - Creator 3.8.8 资源数据库已记录全部 14 个 Framework `.meta` 及对应 `db://assets/framework/**` URL；14 个 UUID 全部唯一，全 assets 共 19 个 UUID 无重复，asset DB 没有 missing 记录。
  - `library/.assets-info.json`、`library/.assets-data.json` 和 editor/preview packer record 均包含 `framework/index.ts` UUID；`library`、`temp`、`profiles` 没有 tracked 文件或 Git diff。
- [x] 1.6 运行当前项目类型检查并记录既有 `strict: false` 基线；新增实现不得使用 `as any`、`@ts-ignore` 或删除有效检查。
  - 使用 Creator 3.8.8 内置 TypeScript 5.8.2；有效项目配置为 `strict: false`、target/module `ES2015`、`noEmit: true`。隔离 Cocos 声明文件后对 `assets/**/*.ts` 执行检查，当前只包含 `assets/framework/index.ts`，结果 0 diagnostics。
  - 完整仓库直接执行 `tsc --project tsconfig.json` 的既有基线非绿色：仓库级 Bun 测试缺少 Node/Bun 类型且不兼容 Cocos ES2015 module/target，Creator 引擎声明也存在 standalone tsc diagnostics；本切片不通过新增依赖、修改 tsconfig 或跳过源码检查掩盖这些工具链边界，Framework asset 源码当前无错误且未使用 `as any`、`@ts-ignore`。

## 2. Logger 基础能力

- [ ] 2.1 先编写 Logger 契约测试，覆盖 debug/info/warn/error、timestamp、scope、message、浅层结构化 context 和可选 error。
- [ ] 2.2 在 `contracts/logging` 定义最小 Logger 公共类型与 child logger 行为，通过根入口只导出稳定 contract，使 2.1 的测试通过且不依赖 Cocos、Application 或具体实现。
- [ ] 2.3 先编写 child logger 测试，覆盖父子 scope、上下文合并、调用级字段覆盖和父 Logger 不可变。
- [ ] 2.4 实现 Logger 上下文派生，使 2.3 的测试通过且不使用全局静态 Logger。
- [ ] 2.5 在 `diagnostics/logging` 实现直接输出结构化记录的 ConsoleLogger，并在仓库级测试支持目录提供不参与 Cocos 构建的 MemoryLogger；验证可以按 level、scope 和浅层 context 断言，不得加入递归序列化、循环检测或敏感字段脱敏。

## 3. ApplicationContext、Module 契约与依赖图

- [ ] 3.1 先编写 ApplicationContext 与 Module 契约类型测试：Context contract 只包含 Logger、ApplicationState 与只读生命周期查询；Module 覆盖稳定 id、只读 dependencies、完整同步/异步钩子，并只能通过 type-only import 依赖 `contracts/application`，禁止依赖 ApplicationContext 实现或 Cocos Component 基类。
- [ ] 3.2 在 `contracts/application` 定义 ApplicationContext interface、ApplicationState 和只读生命周期查询契约，在 `contracts/module` 定义 Module、ModulePhase、ModuleRuntimeState 和 ModuleLifecycleError，使 3.1 通过；contracts 不得导入 `application`、diagnostics 或 adapters。
- [ ] 3.3 先编写 ModuleGraph 测试，覆盖空模块集合、单模块、依赖链、分支依赖和独立模块注册顺序稳定性。
- [ ] 3.4 先编写 ModuleGraph 失败测试，覆盖空 id、重复 id、缺失依赖、自循环和多节点循环。
- [ ] 3.5 实现一次性 ModuleGraph 校验与稳定拓扑排序，使 3.3、3.4 的测试通过，并保证校验失败前没有执行任何模块钩子。

## 4. ModuleRunner 初始化与回滚

- [ ] 4.1 先编写 ModuleRunner 主路径测试，重点覆盖正序 initialize/start 和逆序 stop/dispose。
- [ ] 4.2 实现 ModuleRunner 的阶段状态记录和主路径生命周期调用，使 4.1 的测试通过并阻止 initialize/start/stop/dispose 重复执行。
- [ ] 4.3 先编写 initialize 失败测试，验证只逆序 dispose 已初始化模块，未初始化模块不执行清理。
- [ ] 4.4 先编写 start 失败测试，验证逆序 stop 已启动模块，再逆序 dispose 已初始化模块。
- [ ] 4.5 在 initialize/start/stop/dispose 测试通过后，补充低优先级 pause/resume 冒烟测试，只覆盖 pause 逆序、resume 正序和省略钩子的兼容性；失败组合延后。
- [ ] 4.6 先编写清理失败测试，验证单个 stop/dispose 错误不会阻断剩余模块清理，且原始失败不会被回滚错误覆盖。
- [ ] 4.7 实现分阶段回滚、错误 cause 保留和清理错误聚合，使 initialize/start/stop/dispose 的失败测试通过，并保持 pause/resume 接口可调用。
- [ ] 4.8 使用 MemoryLogger 验证每个模块阶段日志都包含 module id、phase、level 和结果字段，不依赖 application identity。

## 5. Application 生命周期与 ApplicationContext

- [ ] 5.1 先编写 Application 主状态测试，重点覆盖 `created -> initializing -> running -> stopping -> disposed`。
- [ ] 5.2 先编写启动失败测试，覆盖 ModuleGraph 校验失败、initialize 失败和 start 失败均进入 `stopping -> disposed`。
- [ ] 5.3 实现 Application 的 start、dispose 和只读 state，使 5.1、5.2 的主路径与失败测试通过。
- [ ] 5.4 先编写 start/start、dispose/dispose、启动中 dispose 和 disposed/start 测试，覆盖主路径 single-flight 与非法终态操作。
- [ ] 5.5 实现生命周期操作串行化和 single-flight，使 5.4 的测试通过且不依赖调用方加锁。
- [ ] 5.6 在主路径稳定后实现 pause/resume，并补充 `running -> paused -> running`、重复 pause/resume 和省略 Module 钩子的低优先级冒烟测试；详细失败与并发矩阵延后。
- [ ] 5.7 先编写 ApplicationContext implementation 边界测试，确认它实现 `contracts/application` 的公开 contract，只包含 logger 和 readonly lifecycle state，不包含 application identity、`get<T>()`、服务注册表、Application 实例或 Game 对象。
- [ ] 5.8 在 `application` 实现 ApplicationContext 的内部实现和供 Composition Root 调用的创建 API，并为每个模块提供以 module id 为 scope 的 child logger；不得从根入口导出可变实现，使 5.7 和模块日志测试通过。
- [ ] 5.9 验证空 Module 数组可以完整 start/dispose，并附带一次基础 pause/resume 冒烟，作为 AppRoot 默认启动基线。

## 6. Cocos Application Adapter 与 AppRoot 组合入口

- [ ] 6.1 先定义并验证 `adapters/cocos/application` 的边界：Adapter 只接收 Application 稳定生命周期 API，拥有运行时事件绑定/解绑职责；AppRoot 不出现 Cocos hide/show 事件常量，且 Composition Root 可以替换 Web、Native 或小游戏平台 Adapter。
- [ ] 6.2 实现 Cocos Application Adapter，把 Cocos Runtime hide/show 事件分别转换为 running → pause、paused → resume；Adapter 不创建 Logger、ApplicationContext、Application 或 Module，不依赖 Game。
- [ ] 6.3 建立显式 Composition Root 函数，按 Logger → ApplicationContext implementation → Application → Module 列表 → 当前平台 Adapter 的顺序装配，默认不创建任何禁止系统模块。
- [ ] 6.4 实现 AppRoot Component 的 onLoad、start 和 onDestroy 主路径：只创建/连接对象、调用 Application start/dispose 和 Adapter bind/unbind，并确保异步启动错误进入 Logger；不得直接监听 hide/show。
- [ ] 6.5 验证 onDestroy 先要求 Adapter 解除 Cocos 事件订阅再调用 dispose，重复销毁不会重复解绑或执行模块清理。
- [ ] 6.6 通过 Cocos Creator 编辑器把 AppRoot 挂载到 `assets/boot/startup.scene`，设置唯一持久应用根，不手工修改 scene/meta JSON。
- [ ] 6.7 在 Cocos Creator 3.8.8 Web Desktop 运行空应用主路径和 Adapter 前后台映射冒烟测试，验证 initialize/start/stop/dispose 日志顺序，以及 hide/pause、show/resume 基础映射；启动中事件、重复事件和失败组合延后。
- [ ] 6.8 检查 startup.scene 和 AppRoot 中没有新增 Cocos 原生业务 UI、FairyGUI、资源加载、场景切换、Game 逻辑组件或平台事件转换逻辑。

## 7. 范围审查与最终验证

- [ ] 7.1 运行全部 Bun foundation 单元测试，确认 ModuleGraph、ModuleRunner、Application 和 Logger 零失败。
- [ ] 7.2 运行项目类型检查和 `git diff --check`，记录结果并区分当前配置基线与本 change 引入的问题。
- [ ] 7.3 运行 Cocos Creator 3.8.8 Web Desktop 构建/预览冒烟验证，确认 AppRoot 脚本已正确导入且无组件或序列化错误。
- [ ] 7.4 扫描新增文件和 import，确认不存在 UI、FairyGUI、Resource、Asset Bundle、Scene、ECS、网络、战斗或游戏业务实现与占位接口，并重新执行内部依赖矩阵：core 不依赖 Cocos、contracts 不依赖具体实现、application/Framework 不依赖 Game、diagnostics/logging 只依赖 logging contract 和必要 core。
- [ ] 7.5 审查公共导出白名单，确认只暴露稳定 ApplicationContext/Application/Module/Logger contracts、必要启动类型和允许捕获的错误；ModuleGraph、ModuleRunner、ApplicationContext 可变实现、MemoryLogger、Console 格式化细节和 Cocos Adapter 内部实现不得被根入口暴露。
- [ ] 7.6 审查全局状态和生命周期，确认没有静态 Application/Logger 单例、重复持久节点、未清理模块，以及 AppRoot 直接监听平台事件、Adapter 未解绑或 AppRoot/Adapter 重复处理生命周期的问题。
- [ ] 7.7 整理实现文件、测试证据、Cocos 冒烟结果和剩余风险，等待代码 review，不自动开始后续 Framework 能力。
