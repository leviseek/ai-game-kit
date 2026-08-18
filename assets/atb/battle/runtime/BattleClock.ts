export class BattleClock {
    private time = 0;
    private tickIndex = 0;

    public getTime(): number {
        return this.time;
    }

    public getTickIndex(): number {
        return this.tickIndex;
    }

    public advance(dt: number) {
        if (dt <= 0) {
            return;
        }

        this.time += dt;
        this.tickIndex++;
    }

    public reset() {
        this.time = 0;
        this.tickIndex = 0;
    }
}
