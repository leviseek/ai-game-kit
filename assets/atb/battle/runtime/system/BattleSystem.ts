import { BattleWorld } from "../BattleWorld";

export abstract class BattleSystem {
    protected abstract readonly TAG: string;

    constructor(protected readonly world: BattleWorld) {}

    public abstract update(dt: number): void;
}
