import type { EnumAudioGroup } from "../enums/EnumAudioGroup";

/** 分组可查询状态：音量与静音为独立维度，静音不覆盖音量设定。 */
export interface IAudioGroupState {
    readonly group: EnumAudioGroup;
    readonly volume: number;
    readonly muted: boolean;
}
