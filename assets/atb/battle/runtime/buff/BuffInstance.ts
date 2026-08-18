import { BuffData } from "./BuffData";

export class BuffInstance {
    public readonly data: BuffData;

    public reamining: number;
    public stacks: number;

    constructor(data: BuffData) {
        this.data = data;

        this.reamining = data.duration;

        this.stacks = 1;
    }

    public addStack() {
        this.stacks = Math.min(this.data.maxStacks, this.stacks + 1);

        this.reamining = this.data.duration;
    }

    public update(dt: number): boolean {
        this.reamining -= dt;

        return this.reamining <= 0;
    }
}
