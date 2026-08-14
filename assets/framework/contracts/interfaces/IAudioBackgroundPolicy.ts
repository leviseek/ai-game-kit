import type { EnumAudioGroup } from "../enums/EnumAudioGroup";

/** 前后台策略：后台切换时暂停的分组，回到前台时按同样集合恢复。 */
export interface IAudioBackgroundPolicy {
    readonly pauseOnBackground: ReadonlyArray<EnumAudioGroup>;
}
