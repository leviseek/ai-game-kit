import type { EnumAudioGroup } from "../enums/EnumAudioGroup";
import type { IAudioTrackRef } from "./IAudioTrackRef";

/**
 * 音频后端契约（引擎接缝）：由 Cocos 适配器或测试替身实现。
 * `available` 表达后端可用性，服务构造时据此决定是否降级。
 * `dispose` 可选：适配器在服务销毁时释放引擎侧资源（如 AudioSource/Node）。
 */
export interface IAudioBackend {
    readonly available: boolean;
    play(group: EnumAudioGroup, track: IAudioTrackRef): void;
    stop(group: EnumAudioGroup): void;
    pause(group: EnumAudioGroup): void;
    resume(group: EnumAudioGroup): void;
    setVolume(group: EnumAudioGroup, volume: number): void;
    dispose?(): void;
}
