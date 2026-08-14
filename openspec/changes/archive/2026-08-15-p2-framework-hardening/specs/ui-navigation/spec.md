## Purpose

明确 `UiNavigator.close` 的非栈顶关闭语义：关闭指定页（缺省栈顶）时，非栈顶页面被原地移除、其余页面相对顺序不变，模态状态由关闭后的新栈顶推导。

## ADDED Requirements

### Requirement: 关闭指定页面契约明确（含非栈顶）

`UiNavigator.close(pageId?)` SHALL 关闭指定页面（缺省栈顶）并释放其页面作用域；关闭**非栈顶**页面 SHALL 原地移除该页，其余页面相对顺序不变（层级关系由打开时按 layer 插入维护）；模态状态 SHALL 始终由关闭后的新栈顶推导；空栈关闭 SHALL 被拒绝；重复关闭幂等。

#### Scenario: 关闭非栈顶页面

- **WHEN** 页面 A、B、C 依序打开（C 为栈顶），关闭中间的 B
- **THEN** B 被移除并释放，A、C 相对顺序不变，C 仍为栈顶，模态状态由 C 推导
