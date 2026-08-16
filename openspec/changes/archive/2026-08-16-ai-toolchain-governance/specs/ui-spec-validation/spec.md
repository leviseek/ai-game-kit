## Purpose

将 fgui-designer 的 UI spec 从自由文本升级为结构化 JSON，并提供 `fgui spec-check` 机器校验，使字号档位、组件类型决策等语义约束在进入 XML 前即可被确定性检查。

## ADDED Requirements

### Requirement: 结构化 UI spec 格式

系统 SHALL 定义 UI spec 的结构化 JSON schema，至少覆盖：画布尺寸、目标包、从底到顶的布局树（对象名/类型/坐标/尺寸/字号/颜色/资源引用）、交互组件的组件类型与选择依据、待确认项列表；schema SHALL 可被校验器机器检查。

#### Scenario: 合法 spec 通过校验

- **WHEN** 提交的 spec.json 满足 schema 且全部字段合法
- **THEN** `fgui spec-check` 报告通过并以退出码 0 结束

#### Scenario: 非法 spec 被拒绝

- **WHEN** spec.json 缺失必填字段（如布局树、字号）或类型错误
- **THEN** `fgui spec-check` 报告具体错误位置并以非零退出码结束

### Requirement: 字号档位强制

系统 SHALL 校验 spec 中每个字号属于档位表 `12 / 14 / 16 / 18 / 20 / 24 / 28 / 32 / 40`；不在档位的值 SHALL 报 error 并提示最近档位。

#### Scenario: 非档位字号被拦截

- **WHEN** spec 中某文本对象字号为 13
- **THEN** `spec-check` 报告 error 并提示修正为 12 或 14

### Requirement: 组件类型决策必填

系统 SHALL 要求 spec 中每个可交互区域（按钮/滑条/下拉/列表/输入等语义）声明组件类型与选择依据；将可交互需求退化为裸 image+text 的 spec SHALL 报 error。

#### Scenario: 缺失决策被拦截

- **WHEN** spec 中某交互区域未声明组件类型或选择依据为空
- **THEN** `spec-check` 报告该区域缺失类型决策

### Requirement: 禁令与命名校验

系统 SHALL 在 spec 层校验项目禁令：禁止 graph 类型对象、禁止手写 transition 描述；对象名 SHALL 符合语义化前缀约定（txt_/btn_/bg_/bar_/loader_/img_/input_）；relation sidePair SHALL 至多 2 项。

#### Scenario: graph 对象被拒绝

- **WHEN** spec 中某对象 type 为 graph
- **THEN** `spec-check` 报 error 并提示改用 sprite 生成图片 + image 引用

#### Scenario: relation 超项被拒绝

- **WHEN** spec 中某 relation 声明 3 个 sidePair
- **THEN** `spec-check` 报 error 并提示仅保留横向与纵向各一项

### Requirement: 双通道统一产出 spec

系统 SHALL 要求读图与纯文字两条输入通道在进入 XML 映射前均先产出结构化 spec.json 并通过 `spec-check`；`/fgui-create` 与 `/fgui-edit` 流程 SHALL 以 spec.json 为中间产物。

#### Scenario: 创建流程强制 spec

- **WHEN** 开发者执行 `/fgui-create` 创建组件
- **THEN** 流程先产出并通过 spec-check 校验 spec.json，再进入 XML 生成阶段
