# AGENTS.md — AI 编码协作约定

本文件是所有 AI 编码工具（OpenCode、Codex、Qoder 等）的项目级指令，优先级高于全局规范。

## 注释语言

- 本仓库代码注释使用**简体中文**；标识符、类型名、API 名称、错误消息字符串、文件路径保持英文。
- 注释只解释不明显的意图、限制、权衡与边界条件；不重复代码表面行为，不写装饰性注释。
- 修改逻辑时同步更新受影响的注释；删除逻辑时同步删除对应注释。
- 关键术语首次出现时保留英文原文，例如：显式所有者对象池（explicit-owner）、幂等（idempotent）、重入（reentrant）、去重（deduplication）、作用域（scope）。

## 其它约束

- 遵循 `.ai/instructions.md` 与 `openspec/config.yaml` 的规则与 guidance。
- 涉及 OpenSpec change 的实现、审查与归档时，按 `openspec/config.yaml` 的 operations 执行。
