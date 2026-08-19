import { BattleWorld } from "./BattleWorld";
import { BattleCommand } from "./command/BattleCommand";
import { CommandQueue } from "./command/CommandQueue";

export class BattleScheduler {
    private queue = new CommandQueue();

    private playing = false;
    private timeScale = 1;

    constructor(private readonly world: BattleWorld) {}

    public start() {
        this.playing = true;
    }

    public pause() {
        this.playing = false;
    }

    public isPlaying(): boolean {
        return this.playing;
    }

    public setTimeScale(scale: number) {
        this.timeScale = Math.max(0, scale);
    }

    public getTimeScale(): number {
        return this.timeScale;
    }

    public schedule(delay: number, command: BattleCommand) {
        const executeAt = this.world.getTime() + Math.max(0, delay);
        this.queue.push(executeAt, command);
    }

    public scheduleAt(executeAt: number, command: BattleCommand) {
        this.queue.push(executeAt, command);
    }

    public update(dt: number, world: BattleWorld, force = false): number {
        if (!this.playing && !force) return 0;

        const battleDt = dt * this.timeScale;
        world.clock.advance(battleDt);

        const commands = this.queue.popDue(world.getTime());
        for (const entry of commands) {
            entry.command.execute(world);
        }

        return battleDt;
    }

    public reset() {
        this.playing = false;
        this.timeScale = 1;
        this.queue.clear();
    }
}
