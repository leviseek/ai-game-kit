import { BattleUnit } from "../BattleUnit";
import { BattleWorld } from "../BattleWorld";
import { BattleEventType, HealEvent } from "../event/BattleEvent";
import { BattleSystem } from "../system/BattleSystem";
import { DamageSystem } from "../system/DamageSystem";
import { EffectContext } from "./EffectContext";
import { EffectData, EffectType } from "./EffectData";
import { EffectResult, EffectResultType } from "./EffectResult";

export class EffectSystem extends BattleSystem {
    protected readonly TAG: string = "EffectSystem";

    constructor(
        protected readonly world: BattleWorld,
        private readonly damageSystem: DamageSystem,
    ) {
        super(world);
    }

    public update(dt: number): void {}

    public apply(context: EffectContext, effect: EffectData): EffectResult {
        const source = this.world.getUnit(context.sourceId);
        const target = this.world.getUnit(context.targetId);

        if (!source || !target) {
            return {
                type: EffectResultType.Miss,
                success: false,
                sourceId: context.sourceId,
                targetId: context.targetId,
            };
        }

        switch (effect.type) {
            case EffectType.Damage:
                return this.applyDamage(context, source, target, effect.value);
            case EffectType.Heal:
                return this.applyHeal(context, source, target, effect.value);
            case EffectType.AddBuff:
                return this.applyBuff(context, source, target, effect.buffId);
            default:
                return {
                    type: EffectResultType.Miss,
                    success: false,
                    sourceId: context.sourceId,
                    targetId: context.targetId,
                };
        }
    }

    private applyDamage(context: EffectContext, source: BattleUnit, target: BattleUnit, amount: number): EffectResult {
        const result = this.damageSystem.dealDamage(source.id, target.id, amount, context);
        return {
            type: EffectResultType.Damage,
            success: true,
            sourceId: source.id,
            targetId: target.id,
            value: amount,
            actualValue: result.actualDamage,
        };
    }

    private applyHeal(context: EffectContext, source: BattleUnit, target: BattleUnit, amount: number): EffectResult {
        const result = target.heal(amount);

        const evt: HealEvent = {
            type: BattleEventType.Heal,
            time: this.world.getTime(),

            casterId: source.id,
            targetId: target.id,

            rawHeal: amount,
            actualHeal: result.actual,

            targetHpBefore: result.before,
            targetHpAfter: result.after,
            context,
            sequence: 0,
        };
        this.world.emitEvent(evt);

        return {
            type: EffectResultType.Heal,
            success: true,
            sourceId: source.id,
            targetId: target.id,
            value: amount,
            actualValue: result.actual,
        };
    }

    private applyBuff(context: EffectContext, source: BattleUnit, target: BattleUnit, buffId: string): EffectResult {
        const added = this.world.buffSystem.addBuff(target, buffId, context);

        return {
            type: EffectResultType.BuffAdded,
            success: added,
            sourceId: source.id,
            targetId: target.id,
        };
    }
}
