## 为什么选择 GPT-5.6 + Superpowers + OpenSpec
你是：

一个高级程序员挑战架构升级。

所以需要：

GPT-5.6

作为：

架构师
Reviewer
技术导师
Superpowers

防止：

AI直接coding
AI跳步骤
AI遗漏测试
OpenSpec

作为：

你的第二大脑。

所有系统变化留下记录。

## 安装 Superpowers
```codex
Fetch and follow instructions from https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/.codex/INSTALL.md
```

## 安装 OpenSpec
```powershell
npm install -g @fission-ai/openspec@latest

cd your-project
openspec init
```

## 自动维护 ADR
```codex
加一个规则：

每次 OpenSpec change 完成后，检查是否产生新的架构决策，如果有则创建 ADR。
```

## AI 游戏研发四层流程关系


```text
             AI 游戏研发体系

                    │

                    ▼


┌────────────────────────────────────────┐
│ Layer 0：AI 协作纪律层                  │
│                                        │
│ 需求                                   │
│  ↓                                     │
│ AI讨论方案                             │
│  ↓                                     │
│ 人确认设计                             │
│  ↓                                     │
│ Spec / ADR / OpenSpec                  │
│  ↓                                     │
│ AI实现                                 │
│  ↓                                     │
│ Review                                 │
│  ↓                                     │
│ 测试验证                               │
└───────────────────┬────────────────────┘
                    │

                    ▼


┌────────────────────────────────────────┐
│ Layer 1：架构设计规范层                │
│                                        │
│ 问题                                   │
│  ↓                                     │
│ 架构讨论                               │
│  ↓                                     │
│ 定义边界                               │
│  ↓                                     │
│ 设计接口                               │
│  ↓                                     │
│ Design Spec                            │
│  ↓                                     │
│ 进入开发                               │
└───────────────────┬────────────────────┘
                    │

                    ▼


┌────────────────────────────────────────┐
│ Layer 2：领域开发流程层                │
│                                        │
│ Framework / UI / Gameplay / Resource  │
│                                        │
│ 需求                                   │
│  ↓                                     │
│ 领域设计                               │
│  ↓                                     │
│ 契约定义                               │
│  ↓                                     │
│ 测试定义                               │
│  ↓                                     │
│ 实现                                   │
│  ↓                                     │
│ 集成                                   │
│  ↓                                     │
│ 验证                                   │
└───────────────────┬────────────────────┘
                    │

                    ▼


┌────────────────────────────────────────┐
│ Layer 3：任务执行层                    │
│                                        │
│ Task拆分                               │
│  ↓                                     │
│ AI执行                                 │
│  ↓                                     │
│ 人工Review                             │
│  ↓                                     │
│ 测试                                   │
│  ↓                                     │
│ 提交                                   │
│  ↓                                     │
│ 下一Task                               │
└────────────────────────────────────────┘

层级关系

    Layer 0
    AI怎么参与开发
            ↓
    Layer 1
    系统怎么设计
            ↓
    Layer 2
    模块怎么实现
            ↓
    Layer 3
    任务怎么推进

```
