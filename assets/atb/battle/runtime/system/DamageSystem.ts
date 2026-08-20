import { EffectContext } from "../effect/EffectContext";
import { BattleEventType, DamageEvent, UnitDiedEvent } from "../event/BattleEvent";
import { StatType } from "../stat/StatType";
import { BattleSystem } from "./BattleSystem";
import { DamageResult } from "./DamageResult";

export class DamageSystem extends BattleSystem {
    protected readonly TAG: string = "DamageSystem";

    public dealDamage(sourceId: string, targetId: string, rawDamage: number, context?: EffectContext): DamageResult {
        const { world } = this;

        const source = world.getUnit(sourceId);
        const target = world.getUnit(targetId);
        if (!source || !target || target.isDead()) {
            return {
                rawDamage,
                finalDamage: 0,
                actualDamage: 0,
                targetHpBefore: 0,
                targetHpAfter: 0,
                killed: false,
            };
        }

        const { stats, events } = world;

        const targetHpBefore = target.hp;
        const defense = stats.getValue(target, StatType.Defense);

        let finalDamage = Math.max(1, rawDamage - defense);

        const dealtMultiplier = stats.getValue(source, StatType.DamageDealt);
        const takenMultiplier = stats.getValue(target, StatType.DamageTaken);

        finalDamage *= dealtMultiplier;
        finalDamage *= takenMultiplier;

        finalDamage = Math.max(1, finalDamage);

        const damageResult = target.takeDamage(finalDamage);

        const killed = target.isDead();

        const result: DamageResult = {
            rawDamage,
            finalDamage,
            actualDamage: damageResult.actual,
            targetHpBefore,
            targetHpAfter: target.hp,
            killed,
        };

        const damageEvt: DamageEvent = {
            type: BattleEventType.Damage,
            time: world.getTime(),
            sourceId,
            targetId,
            rawDamage,
            finalDamage,
            actualDamage: result.actualDamage,
            targetHpBefore,
            targetHpAfter: target.hp,
            killed,
            context,
            sequence: 0,
        };
        events.emit(damageEvt);

        if (killed) {
            const deathEvt: UnitDiedEvent = {
                type: BattleEventType.UnitDied,
                time: world.getTime(),
                unitId: target.id,
                killerId: sourceId,
                sequence: 0,
            };
            events.emit(deathEvt);
        }

        return result;
    }

    public update(dt: number): void {}
}
