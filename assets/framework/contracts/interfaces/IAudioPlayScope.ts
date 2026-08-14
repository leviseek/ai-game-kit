import type { EnumAudioGroup } from "../enums/EnumAudioGroup";
import type { IAudioTrackRef } from "./IAudioTrackRef";

/**
 * 播放作用域：记录其启动的播放。release 时停止该作用域仍持有的当前播放；
 * 已被切歌接管或停止的播放不受影响（幂等）。
 */
export interface IAudioPlayScope {
    play(group: EnumAudioGroup, track: IAudioTrackRef): void;
    release(): void;
}
