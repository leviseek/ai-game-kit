# audio Specification

## Purpose

提供引擎无关的分组音频服务与 Cocos 音频适配：按 music/sfx/ui 分组管理播放、音量、静音、切歌与作用域停止，并在音频后端不可用时降级为 no-op，使音频策略可在纯 TypeScript 下独立测试并随应用前后台切换。

## Requirements

### Requirement: Audio is organized into groups

音频服务 MUST 支持 music、sfx、ui 三个音频分组。分组 MUST 彼此独立地管理音量与静音状态；对某分组音量或静音的修改 MUST NOT 影响其他分组。

#### Scenario: Groups keep independent volume and mute state
- **WHEN** 调用方将 music 分组音量设为 0.5 并静音 sfx 分组
- **THEN** music 分组维持音量 0.5 且不被静音，sfx 分组保持静音，ui 分组不受影响

### Requirement: Volume and mute are adjustable

音频服务 MUST 支持设置分组音量与静音状态。音量值 MUST 在合法范围内（0 到 1 含边界）被接受，非法音量 MUST 被拒绝并保留原值。静音 MUST 不改变既有音量设定，取消静音后按原音量恢复。

#### Scenario: Invalid volume is rejected
- **WHEN** 调用方将某分组音量设为超出合法范围的值
- **THEN** 操作失败并保留该分组原有音量

#### Scenario: Mute preserves volume setting
- **WHEN** 调用方将某分组静音后取消静音
- **THEN** 取消静音后该分组恢复到静音前的音量值

### Requirement: Audio can be played, stopped and switched

音频服务 MUST 支持按音频标识播放、停止、暂停与恢复，并支持切歌（停止当前播放并开始新音频）。停止与切歌 MUST 对未播放的音频为无害操作。

#### Scenario: Switching track stops the previous one
- **WHEN** 某分组正在播放音频 `A`，调用方切换到音频 `B`
- **THEN** 分组停止播放 `A` 并开始播放 `B`

#### Scenario: Stopping idle audio is harmless
- **WHEN** 调用方停止一个当前未播放的音频
- **THEN** 操作无副作用且不产生错误

### Requirement: Audio stops with its scope

音频服务 MUST 支持作用域停止：调用方声明的播放作用域被释放时，该作用域启动的全部音频 MUST 停止，且不影响其他作用域的播放。

#### Scenario: Disposed scope stops only its own audio
- **WHEN** 作用域 `S1` 与 `S2` 各自播放音频，随后释放 `S1`
- **THEN** `S1` 启动的音频停止，`S2` 的播放不受影响

### Requirement: Audio service degrades when backend is unavailable

当音频后端不可用时，音频服务 MUST 以可观察的降级方式运行：所有播放与停止操作 MUST 为无害 no-op 且不抛出错误，调用方 MUST 能感知服务处于降级状态。音频能力缺失 MUST NOT 导致应用初始化或运行失败。

#### Scenario: Missing backend degrades gracefully
- **WHEN** 音频后端不可用且调用方执行播放、停止、设音量等操作
- **THEN** 所有操作无副作用地成功返回（或返回表示降级的结果），且调用方可查询到服务处于降级状态

### Requirement: Background transition follows a defined policy

音频服务 MUST 按既定策略响应应用前后台切换。后台切换 MUST 按策略暂停或降低指定分组播放，前台恢复 MUST 按策略恢复；策略 MUST 可由调用方配置，且切换处理不得抛错破坏生命周期。

#### Scenario: Background pauses music per policy
- **WHEN** 应用切到后台且策略声明后台暂停 music 分组
- **THEN** music 分组停止/暂停播放；应用回到前台后按策略恢复
