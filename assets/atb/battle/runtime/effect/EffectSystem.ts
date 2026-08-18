import { BattleUnit } from "../BattleUnit";
import { BattleWorld } from "../BattleWorld";
import { BattleSystem } from "../system/BattleSystem";
import { DamageSystem } from "../system/DamageSystem";
import { EffectData, EffectType } from "./EffectData";

export class EffectSystem extends BattleSystem {
    constructor(
        protected readonly world: BattleWorld,
        private readonly damageSystem: DamageSystem,
    ) {
        super(world);
    }

    public update(dt: number): void {
        throw new Error("Method not implemented.");
    }

    public apply(caster: BattleUnit, target: BattleUnit, effect: EffectData) {
        switch (effect.type) {
            case EffectType.Damage:
                this.damageSystem.dealDamage(caster.id, target.id, effect.value);
                break;
            default:
                console.warn(`Unknown effect type: ${effect.type}`);
        }
    }
}
