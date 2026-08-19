import { BattleWorld } from "../runtime/BattleWorld";
import { BattleSandboxState, DEFAULT_SANDBOX_STATE } from "./BattleSandboxState";
import { BattleUnitSnapshot } from "./BattleUnitSnapshot";

export class BattleSandboxController {
    public readonly state: BattleSandboxState;

    constructor(public readonly world: BattleWorld) {
        this.state = DEFAULT_SANDBOX_STATE;
    }

    public pause() {
        this.state.paused = true;
    }

    public resume() {
        this.state.paused = false;
    }

    public step(dt: number) {
        this.world.update(dt);
        this.state.currentTime = this.world.getTime();
    }

    public togglePause() {
        this.state.paused = !this.state.paused;
    }

    public setSpeed(speed: number) {
        this.state.speed = Math.max(0, speed);
    }

    public selectUnit(unitId: string | null) {
        this.state.selectedUnitId = unitId;
    }

    public getUnitInspector(unitId: string): BattleUnitSnapshot | undefined {
        return this.world.getUnit(unitId)?.createSnapshot();
    }
}
