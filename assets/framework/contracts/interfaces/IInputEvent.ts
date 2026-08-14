import type { IInputSourceId } from "./IInputSourceId";

/** 底层输入事件：来源、按下/释放状态与可选连续值（如摇杆位移）。 */
export interface IInputEvent {
    readonly sourceId: IInputSourceId;
    readonly pressed: boolean;
    readonly value?: number;
}
