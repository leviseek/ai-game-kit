// phase 推进方向：initialize -> start -> pause/resume -> stop -> dispose（启动正序、清理逆序）。
export enum EnumModulePhase {
    Initialize = "initialize",
    Start = "start",
    Pause = "pause",
    Resume = "resume",
    Stop = "stop",
    Dispose = "dispose",
}
