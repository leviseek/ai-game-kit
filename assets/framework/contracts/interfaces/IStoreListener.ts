/** Store 订阅监听器：state 变更后收到最新状态（可调用接口形态）。 */
export interface IStoreListener<S> {
    (state: S): void;
}
