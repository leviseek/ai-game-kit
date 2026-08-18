import { BattleWorld } from "../BattleWorld";
import { EffectContext } from "./EffectContext";
import { EffectData } from "./EffectData";
import { EffectResult } from "./EffectResult";

export class EffectPipeline {
    constructor(private readonly world: BattleWorld) {}

    public apply(contextBase: Omit<EffectContext, "effectIndex">, effects: EffectData[]): EffectResult[] {
        const results: EffectResult[] = [];
        for (let i = 0; i < effects.length; i++) {
            const effect = effects[i];
            const context: EffectContext = {
                ...contextBase,
                effectIndex: i,
            };
            const result = this.world.effectSystem.apply(context, effect);
            results.push(result);
        }

        return results;
    }
}
