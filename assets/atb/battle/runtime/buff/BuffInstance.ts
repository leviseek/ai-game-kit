import { BuffData } from "./BuffData";
import { BuffModifier } from "./BuffModifier";

export class BuffInstance {
    public readonly data: BuffData;

    public reamining: number;
    public stacks: number;

    public periodicTimer = 0;

    constructor(data: BuffData) {
        this.data = data;

        this.reamining = data.duration;

        this.stacks = 1;
    }

    public addStack() {
        this.stacks = Math.min(this.data.maxStacks, this.stacks + 1);

        this.reamining = this.data.duration;
    }

    public getModifiers(): BuffModifier[] {
        return this.data.modifiers ?? [];
    }

    public consumePeriodicTicks(): number {
        if (!this.data.periodic) {
            return 0;
        }

        const interval = this.data.periodic.interval;
        if (interval <= 0) {
            return 0;
        }

        const ticks = Math.floor(this.periodicTimer / interval);

        if (ticks > 0) {
            this.periodicTimer -= ticks * interval;
        }

        return ticks;
    }

    public update(dt: number): boolean {
        this.reamining -= dt;

        if (this.data.periodic) {
            this.periodicTimer += dt;
        }

        return this.reamining <= 0;
    }
}
