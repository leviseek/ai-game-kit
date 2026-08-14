import type { EnumAudioGroup } from "../enums/EnumAudioGroup";
import type { IAudioGroupState } from "./IAudioGroupState";
import type { IAudioPlayScope } from "./IAudioPlayScope";

/** 引擎无关的音频服务：分组状态、音量/静音、播放与作用域、降级查询。 */
export interface IAudioService {
    /** 后端不可用时为 true；此时所有操作均为无害 no-op。 */
    readonly degraded: boolean;
    createPlayScope(): IAudioPlayScope;
    getGroupState(group: EnumAudioGroup): IAudioGroupState;
    /** 设置分组音量。返回 false 表示非法值被拒绝并保留原值。 */
    setVolume(group: EnumAudioGroup, volume: number): boolean;
    setMuted(group: EnumAudioGroup, muted: boolean): void;
    stop(group: EnumAudioGroup): void;
    pause(group: EnumAudioGroup): void;
    resume(group: EnumAudioGroup): void;
    /** 取消可见性订阅等资源，重复调用为无操作。 */
    dispose(): void;
}
