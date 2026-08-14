/** 类型化 gameplay action 采样：action 标识由调用方定义。 */
export interface IInputSample<TAction> {
    readonly action: TAction;
    readonly pressed: boolean;
    /** 连续值：模拟输入（如摇杆位移）透传原始值；数字输入未携带值时按下=1、释放=0。 */
    readonly value: number;
    readonly timestamp: number;
}
