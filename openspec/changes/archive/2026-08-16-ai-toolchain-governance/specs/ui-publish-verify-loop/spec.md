## Purpose

提供「FGUI 源 XML → validate → 真实发布 → 产物检测 → 运行时冒烟」的编排验证闭环命令，将原本需要人工在 FGUI 编辑器与 Creator 中分别操作的多步验证收敛为一条可重复执行的命令。

## ADDED Requirements

### Requirement: 编排命令 verify:ui-loop

系统 SHALL 提供 `bun run verify:ui-loop` 编排命令，依次执行：`fgui validate --strict`（目标包）→ 经 fgui-mcp 真实发布（`redirectToScratch:false` 写入 `assets/ui`）→ `check_publish` 三重证据检测（发布信号 + 产物 mtime + validate）→ `ccc ui-smoke` 运行时冒烟；任一步失败 SHALL 停止后续步骤并以非零退出码结束。

#### Scenario: 全链路通过

- **WHEN** 源 XML 合法且 FGUI 编辑器与 Creator 环境齐备
- **THEN** 命令依次执行四阶段并输出各阶段结果，退出码 0

#### Scenario: validate 失败阻断

- **WHEN** 目标包存在 validate error
- **THEN** 命令在 validate 阶段即失败退出，不执行发布与冒烟

### Requirement: 环境缺失的语义化降级

系统 SHALL 在 FGUI 编辑器未打开/探针插件未加载、或 Creator 环境缺失时，输出明确的跳过指引（指出缺失项与恢复步骤），以约定的语义化退出码结束，SHALL NOT 输出晦涩的进程错误或静默假装成功。

#### Scenario: 编辑器未就绪

- **WHEN** 执行发布阶段但 fgui-mcp 探针不可达
- **THEN** 命令报告「编辑器未就绪 + 恢复指引」并以约定的环境缺失退出码结束

#### Scenario: Creator 缺失

- **WHEN** 冒烟阶段无法定位 Cocos Creator
- **THEN** 命令报告缺失项与 `COCOS_CREATOR_HOME` 指引并以约定的环境缺失退出码结束

### Requirement: 发布安全确认

系统 SHALL 要求真实发布（写 `assets/ui` 的 `redirectToScratch:false`）为显式行为：`verify:ui-loop` 默认 SHALL NOT 对任意包无条件真实发布，目标包与发布意图 SHALL 通过显式参数声明。

#### Scenario: 未声明目标包不发布

- **WHEN** 开发者未指定目标包运行 `verify:ui-loop`
- **THEN** 命令拒绝执行并提示必须显式声明目标包

### Requirement: 结果报告

系统 SHALL 输出三阶段（发布/检测/冒烟）结构化结果汇总：每阶段状态（通过/失败/跳过）、关键证据（产物路径、mtime、smoke 结论），供人工或 AI 直接消费。

#### Scenario: 阶段汇总输出

- **WHEN** 全链路完成（含跳过阶段）
- **THEN** 输出包含每阶段状态与证据的汇总报告
