import { BattleWorld } from "../BattleWorld";
import { EffectContext } from "./EffectContext";
import { EffectData } from "./EffectData";
import { EffectResult } from "./EffectResult";

export class EffectPipeline {
    constructor(private readonly world: BattleWorld) {}

    public apply(contextBase: Omit<EffectContext, "effectIndex">, effcts: EffectData[]): EffectResult[] {
        const results: EffectResult[] = [];
        for (let i = 0; i < effcts.length; i++) {
            const effect = effcts[i];
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
