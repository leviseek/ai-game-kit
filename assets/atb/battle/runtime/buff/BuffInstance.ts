import { BuffData } from "./BuffData";
import { BuffModifier } from "./BuffModifier";

export class BuffInstance {
    public readonly data: BuffData;

    public remaining: number;
    public stacks: number;

    public periodicTimer = 0;
    public tickCount = 0;

    constructor(
        data: BuffData,
        public readonly sourceId: string,
    ) {
        this.data = data;

        this.remaining = data.duration;

        this.stacks = 1;
    }

    public addStack() {
        this.stacks = Math.min(this.data.maxStacks, this.stacks + 1);

        this.remaining = this.data.duration;
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
        this.remaining -= dt;

        if (this.data.periodic) {
            this.periodicTimer += dt;
        }

        return this.remaining <= 0;
    }
}
