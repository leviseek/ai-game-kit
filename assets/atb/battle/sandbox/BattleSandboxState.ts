export class BattleSandboxState {
    paused: boolean = false;
    replaying: boolean = false;
    speed: number = 1;
    selectedUnitId: string | null = null;
    currentTime: number = 0;
    replayTargetTime: number = 0;
}
