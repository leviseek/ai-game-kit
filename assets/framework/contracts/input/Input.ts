/**
 * 输入内核契约：底层输入事件、类型化 action 采样、输入上下文与映射声明。
 * 不依赖 cc/fgui；action 标识由调用方定义，框架只保证类型一致与映射可配置。
 */

/** 底层输入源标识，如 `keyboard.space`、`gamepad.leftStickX`。 */
export type InputSourceId = string;

/** 输入上下文标识，如 `ui`、`gameplay`。 */
export type InputContextId = string;

/** 底层输入事件：来源、按下/释放状态与可选连续值（如摇杆位移）。 */
export interface InputEvent {
    readonly sourceId: InputSourceId;
    readonly pressed: boolean;
    readonly value?: number;
}

/** 类型化 gameplay action 采样：action 标识由调用方定义。 */
export interface InputSample<TAction> {
    readonly action: TAction;
    readonly pressed: boolean;
    /** 连续值：模拟输入（如摇杆位移）透传原始值；数字输入未携带值时按下=1、释放=0。 */
    readonly value: number;
    readonly timestamp: number;
}

/** 单个输入上下文下的映射声明：底层输入源 → action。 */
export type InputMapping<TAction> = Readonly<
    Record<InputSourceId, TAction>
>;

/**
 * 可替换的底层输入源。订阅后持续推送底层输入事件，取消订阅返回句柄；
 * 内核在替换/释放输入源时退订，事件接收方无需感知来源生命周期。
 * id 供适配器/调试识别来源，内核不读取。
 */
export interface InputSource {
    readonly id: InputSourceId;
    subscribe(listener: (event: InputEvent) => void): () => void;
}
