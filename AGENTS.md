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

## FGUI 工作流

- **禁止使用 FGUI graph 组件**（见 `.ai/instructions.md` 第 9 条）：任何组件源 XML 不得出现 `<graph>` 节点；纯色视觉一律用 `bun run fgui sprite` 生成像素图并以 `<image>` 引用。
- **FGUI 组件创建/修改必须委派给 fgui-designer subagent**（绑定多模态 `codexapis/gpt-5.6-sol`）：遇到创建或修改 `ui/demo/assets/**/*.xml`、`package.xml` 的需求，先委派 `fgui-designer`，不要在主会话直接手写 XML。
- **新建组件用 `/fgui-create`，编辑已有组件必须用 `/fgui-edit`**（编辑是写操作，必须走显式 command 固化的流程，禁止主 agent 凭记忆直接改）。
- **确定性操作一律用 fgui CLI**：资源清单/组件索引/引用校验/短 id 分配/像素图生成与登记，均通过 `bun run fgui <command>`（`tools/fgui/`）。任何 src 引用前先 `list-resources` 确认真实资源 id，产出 XML 后必须 `validate` 到通过。
