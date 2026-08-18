import { BattleWorld } from "./BattleWorld";
import { BattleCommand } from "./command/BattleCommand";
import { CommandQueue } from "./command/CommandQueue";

export class BattleScheduler {
    private queue = new CommandQueue();

    private currentTime = 0;

    private playing = false;

    private timeScale = 1;

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

    public getCurrentTime(): number {
        return this.currentTime;
    }

    public schedule(executeTime: number, command: BattleCommand) {
        this.queue.enqueue(executeTime, command);
    }

    public step(dt: number, world: BattleWorld) {
        const previousPlaying = this.playing;

        this.playing = true;

        this.update(dt, world);

        this.playing = previousPlaying;
    }

    public setCurrentTime(time: number) {
        this.currentTime = Math.max(0, time);
    }

    public update(dt: number, world: BattleWorld): number {
        if (!this.playing) {
            return 0;
        }

        const scaleDt = dt * this.timeScale;

        this.currentTime += scaleDt;

        this.queue.executeDueCommands(world, this.currentTime);

        return scaleDt;
    }

    public reset() {
        this.currentTime = 0;
        this.playing = false;
        this.timeScale = 1;
        this.queue.clear();
    }

    public getPendingCommandCount(): number {
        return this.queue.getSize();
    }
}
