import { BattleWorld } from "../runtime/BattleWorld";
import { BattleSandboxState } from "./BattleSandboxState";
import { BattleUnitSnapshot } from "./BattleUnitSnapshot";

export class BattleSandboxController {
    public readonly state: BattleSandboxState;

    constructor(public readonly world: BattleWorld) {
        this.state = new BattleSandboxState();
    }

    public getUnitInspector(unitId: string): BattleUnitSnapshot | undefined {
        return this.world.getUnit(unitId)?.createSnapshot();
    }

    public play() {
        this.state.paused = false;
    }

    public pause() {
        this.state.paused = true;
    }

    public step(dt: number) {
        this.world.step(dt);
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

    public restart() {}

    public reset() {
        this.world.reset();
        this.state.selectedUnitId = null;

        this.state.paused = true;
    }
}
