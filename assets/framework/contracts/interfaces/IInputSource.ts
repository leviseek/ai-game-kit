import type { IInputSourceId } from "./IInputSourceId";
import type { IInputEvent } from "./IInputEvent";

/**
 * 可替换的底层输入源。订阅后持续推送底层输入事件，取消订阅返回句柄；
 * 内核在替换/释放输入源时退订，事件接收方无需感知来源生命周期。
 * id 供适配器/调试识别来源，内核不读取。
 */
export interface IInputSource {
    readonly id: IInputSourceId;
    subscribe(listener: (event: IInputEvent) => void): () => void;
}
