/** 可观察状态：读取、写入与订阅变化。写入相同值不触发订阅（幂等语义）。 */
export interface IBindable<T> {
    get(): T;
    set(value: T): void;
    /** 订阅变化；返回释放句柄，调用后不再收到后续通知。 */
    subscribe(listener: (value: T) => void): { dispose(): void };
}
