## 1. 验证基线与目录边界

- [ ] 1.1 记录 Bun、Node 和可用测试运行器现状，确认 Bun 可直接执行 TypeScript 且无需新增依赖；建立可重复执行的 Bun foundation 测试命令，并用最小失败测试证明门禁生效。
- [ ] 1.2 按 design.md 建立 `core`、`contracts`、`application`、`diagnostics/logging` 和 `adapters/cocos/application` 目录，不创建 UI、resource、scene、ECS 或 game 业务目录。
- [ ] 1.3 建立 `assets/framework/index.ts` 的最小公开入口和导入边界测试，先证明跨模块深层导入会被检查发现。
- [ ] 1.4 通过 Cocos Creator 导入新增 assets 文件并生成 `.meta`，检查没有手工复制 UUID、没有改动 `library`、`temp` 或 `profiles`。
- [ ] 1.5 运行当前项目类型检查并记录既有 `strict: false` 基线；新增实现不得使用 `as any`、`@ts-ignore` 或删除有效检查。

## 2. Logger 基础能力

- [ ] 2.1 先编写 Logger 契约测试，覆盖 debug/info/warn/error、timestamp、scope、message、浅层结构化 context 和可选 error。
- [ ] 2.2 定义最小 Logger 公共类型与 child logger 行为，使 2.1 的测试通过且不依赖 Cocos。
- [ ] 2.3 先编写 child logger 测试，覆盖父子 scope、上下文合并、调用级字段覆盖和父 Logger 不可变。
- [ ] 2.4 实现 Logger 上下文派生，使 2.3 的测试通过且不使用全局静态 Logger。
- [ ] 2.5 实现直接输出结构化记录的 ConsoleLogger 和仅供测试使用的 MemoryLogger，验证可以按 level、scope 和浅层 context 断言；不得加入递归序列化、循环检测或敏感字段脱敏。

## 3. Module 契约与依赖图

- [ ] 3.1 先编写 Module 契约类型测试，覆盖稳定 id、只读 dependencies、完整 initialize/start/pause/resume/stop/dispose 同步或异步钩子，以及禁止依赖 Cocos Component 基类。
- [ ] 3.2 定义 Module、ModulePhase、ModuleRuntimeState 和 ModuleLifecycleError，使 3.1 的类型与行为约束通过。
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
- [ ] 5.7 先编写 ApplicationContext 边界测试，确认只包含 logger 和 readonly lifecycle state，不包含 application identity、`get<T>()`、服务注册表或 Game 对象。
- [ ] 5.8 实现最小 ApplicationContext，并为每个模块提供以 module id 为 scope 的 child logger，使 5.7 和模块日志测试通过。
- [ ] 5.9 验证空 Module 数组可以完整 start/dispose，并附带一次基础 pause/resume 冒烟，作为 AppRoot 默认启动基线。

## 6. AppRoot Cocos 启动入口

- [ ] 6.1 建立显式 Composition Root 函数，按 Logger → ApplicationContext → Application → Module 列表的顺序装配，默认不创建任何禁止系统模块。
- [ ] 6.2 实现 AppRoot Component 的 onLoad、start 和 onDestroy 主路径，并确保异步启动错误进入 Logger。
- [ ] 6.3 验证 onDestroy 先解除 Cocos 事件订阅再调用 dispose，重复销毁不会重复执行模块清理。
- [ ] 6.4 通过 Cocos Creator 编辑器把 AppRoot 挂载到 `assets/boot/startup.scene`，设置唯一持久应用根，不手工修改 scene/meta JSON。
- [ ] 6.5 在 Cocos Creator 3.8.8 Web Desktop 运行空应用主路径冒烟测试，验证 initialize/start/stop/dispose 日志顺序。
- [ ] 6.6 主路径通过后再接入 hide/show，并只验证 running/hide → paused、paused/show → running 的基础映射；启动中事件、重复事件和失败组合延后。
- [ ] 6.7 检查 startup.scene 中没有新增 Cocos 原生业务 UI、FairyGUI、资源加载、场景切换或 Game 逻辑组件。

## 7. 范围审查与最终验证

- [ ] 7.1 运行全部 Bun foundation 单元测试，确认 ModuleGraph、ModuleRunner、Application 和 Logger 零失败。
- [ ] 7.2 运行项目类型检查和 `git diff --check`，记录结果并区分当前配置基线与本 change 引入的问题。
- [ ] 7.3 运行 Cocos Creator 3.8.8 Web Desktop 构建/预览冒烟验证，确认 AppRoot 脚本已正确导入且无组件或序列化错误。
- [ ] 7.4 扫描新增文件和导入，确认不存在 UI、FairyGUI、Resource、Asset Bundle、Scene、ECS、战斗或游戏业务实现与占位接口。
- [ ] 7.5 审查公共导出，确认 ModuleGraph、ModuleRunner、Console 格式化内部细节没有被根入口暴露。
- [ ] 7.6 审查全局状态和生命周期，确认没有静态 Application/Logger 单例、重复持久节点、未解绑 Cocos 事件或未清理模块。
- [ ] 7.7 整理实现文件、测试证据、Cocos 冒烟结果和剩余风险，等待代码 review，不自动开始后续 Framework 能力。
