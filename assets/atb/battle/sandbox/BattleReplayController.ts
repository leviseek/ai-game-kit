import { BattleSandboxController } from "./BattleSandboxController";

export class BattleReplayController {
    constructor(private readonly sandbox: BattleSandboxController) {}

    public replayTo(targetTime: number) {
        const { world, state } = this.sandbox;
        state.replaying = true;
        state.replayTargetTime = targetTime;

        this.sandbox.reset();

        while (world.getTime() < targetTime) {
            const remaining = targetTime - world.getTime();
            world.step(Math.min(0.02, remaining));
        }

        state.replaying = false;
        state.currentTime = world.getTime();
    }
}
