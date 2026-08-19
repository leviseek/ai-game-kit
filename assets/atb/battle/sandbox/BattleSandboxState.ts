export interface BattleSandboxState {
    paused: boolean;
    speed: number;
    selectedUnitId: string | null;
    currentTime: number;
}

export const DEFAULT_SANDBOX_STATE: BattleSandboxState = {
    paused: false,
    speed: 1,
    selectedUnitId: null,
    currentTime: 0,
};
