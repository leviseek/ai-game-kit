/**
 * 应用状态机推进方向：created -> initializing -> running <-> paused -> stopping -> disposed。
 * 值保留运行期字符串字面量（如 `"created"`），既有字符串比较不破裂。
 */
export enum EnumApplicationState {
    Created = "created",
    Initializing = "initializing",
    Running = "running",
    Paused = "paused",
    Stopping = "stopping",
    Disposed = "disposed",
}
