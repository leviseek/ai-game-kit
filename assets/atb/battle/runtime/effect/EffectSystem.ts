import { BattleUnit } from "../BattleUnit";
import { BattleWorld } from "../BattleWorld";
import { BattleEventType, HealEvent } from "../event/BattleEvent";
import { BattleSystem } from "../system/BattleSystem";
import { DamageSystem } from "../system/DamageSystem";
import { EffectData, EffectType } from "./EffectData";

export class EffectSystem extends BattleSystem {
    protected readonly TAG: string = "EffectSystem";

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
            case EffectType.Heal:
                this.applyHeal(caster, target, effect.value);
                break;
            case EffectType.AddBuff:
                this.world.buffSystem.addBuff(target, effect.buffId);
                break;
            default:
                console.warn(`Unknown effect: ${effect}`);
        }
    }

    private applyHeal(caster: BattleUnit, target: BattleUnit, amount: number) {
        const result = target.heal(amount);

        this.world.events.emit({
            type: BattleEventType.Heal,
            time: this.world.getTime(),

            casterId: caster.id,
            targetId: target.id,

            rawHeal: amount,
            actualHeal: result.actual,

            targetHpBefore: result.before,
            targetHpAfter: result.after,
        } as HealEvent);
    }
}
