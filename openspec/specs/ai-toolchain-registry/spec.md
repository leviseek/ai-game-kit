# ai-toolchain-registry Specification

## Purpose
为仓库内 AI 协作资产（skills、commands、subagent 定义、模型注册表）提供单一来源与确定性同步，消除跨工具目录复制导致的漂移与空目录残留。
## Requirements
### Requirement: 单一来源 registry

系统 SHALL 提供单一权威的 AI 资产 registry，作为仓库内全部 skills/commands/agents 与模型注册表的唯一真源；`.codex`、`.cursor`、`.claude`、`.opencode`、`.qoder` 等工具目录中的对应文件 SHALL 由该 registry 生成，任何工具目录不得存在 registry 之外的权威副本。

#### Scenario: 工具目录由 registry 生成

- **WHEN** 开发者运行 `bun run ai-sync sync`
- **THEN** 所有目标工具目录中的 skills/commands/agents 文件与 registry 内容一致（逐字相同）

#### Scenario: 直接修改工具目录被检出

- **WHEN** 开发者未经 sync 直接改动某工具目录下的受管文件
- **THEN** `bun run ai-sync check` 报告该文件与 registry 不一致并给出修复指引

### Requirement: 同步命令 sync

系统 SHALL 提供 `sync` 命令，将 registry 内容按声明的目标映射复制到各工具目录；目标目录中不受管的历史残留文件（如空目录）SHALL 被检出并报告，不得静默保留或删除。

#### Scenario: 空目录残留被报告

- **WHEN** registry 中不存在某工具目录下实际存在的空目录（如 `magic-ui`）
- **THEN** `doctor` 报告该空目录为未受管残留，并给出「补齐 SKILL.md 纳入 registry 或删除」的处理建议

### Requirement: 逐字 freshness 校验 check

系统 SHALL 提供 `check` 命令，重算每个受管文件在目标目录中的期望内容并与磁盘逐字对比；缺失、过期、多余均 SHALL 报 error 并以非零退出码结束（对齐 `fgui validate` 的 freshness 语义）。

#### Scenario: 过期副本阻断

- **WHEN** registry 更新后目标目录副本未同步
- **THEN** `bun run ai-sync check` 以非零退出码列出全部过期文件

#### Scenario: 多余副本检出

- **WHEN** 目标目录存在 registry 已不声明的文件
- **THEN** `check` 报告该文件为多余残留

### Requirement: 漂移诊断 doctor

系统 SHALL 提供 `doctor` 命令，汇总报告：缺失的受管文件、过期的副本、未受管的空目录、registry 自身的结构问题（如重复 id、无效目标映射）。

#### Scenario: 全量诊断

- **WHEN** 开发者运行 `bun run ai-sync doctor`
- **THEN** 输出结构化的漂移清单，每项带严重度（error/warning）与修复建议

### Requirement: 模型注册表与可用性探测

系统 SHALL 提供模型注册表（角色 → primary/fallback 映射）与 `verify-models` 命令；`verify-models` SHALL 探测注册表中每个模型的可用性并输出结构化报告，供委派前决策是否降级。

#### Scenario: 探测结果报告

- **WHEN** 开发者运行 `bun run ai-sync verify-models`
- **THEN** 输出每个角色 primary/fallback 模型的可用状态（可用/不可用/未配置），不可用项带降级建议

#### Scenario: subagent 模型引用单一来源

- **WHEN** 开发者检查 `.opencode/agent/*.md` 的 model 声明
- **THEN** 该声明引用 registry 中定义的模型标识，且与模型注册表一致，禁止在 agent 文件内散落裸模型名

