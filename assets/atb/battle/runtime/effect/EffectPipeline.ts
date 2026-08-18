import { BattleUnit } from "../BattleUnit";
import { BattleWorld } from "../BattleWorld";
import { EffectData } from "./EffectData";

export class EffectPipeline {
    constructor(private readonly world: BattleWorld) {}

    public apply(caster: BattleUnit, target: BattleUnit, effects: EffectData[]) {
        for (const effect of effects) {
            this.world.effectSystem.apply(caster, target, effect);
        }
    }
}
