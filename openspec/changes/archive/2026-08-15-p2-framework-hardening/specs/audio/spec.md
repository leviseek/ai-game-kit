## Purpose

Cocos 音频适配器 dispose 后不可复活：销毁后 `play`/`stop`/`pause`/`resume`/`setVolume` 均为 no-op（不重建 AudioSource、不发起加载），重复 dispose 幂等——服务生命周期契约明确"销毁即不可用"。

## ADDED Requirements

### Requirement: 音频适配器销毁后 no-op

`CocosAudioAdapter.dispose` SHALL 释放全部持有并销毁引擎侧 AudioSource，之后任何操作（`play`/`stop`/`pause`/`resume`/`setVolume`）SHALL 为 no-op，SHALL NOT 重建 AudioSource 或发起新资源加载；重复调用 dispose SHALL 幂等。

#### Scenario: 销毁后调用不复活

- **WHEN** 适配器销毁后调用 `play`/`stop`/`pause`/`resume`/`setVolume`
- **THEN** 全部为 no-op：不创建新 AudioSource（原实例仍为唯一实例）、不触发播放/停止/音量变化、不发起资源加载
