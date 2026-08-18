import { BattleEventType, DamageEvent, UnitDiedEvent } from "../event/BattleEvent";
import { StatType } from "../stat/StatType";
import { BattleSystem } from "./BattleSystem";

export class DamageSystem extends BattleSystem {
    protected readonly TAG: string = "DamageSystem";

    public dealDamage(attackerId: string, targetId: string, rawDamage: number) {
        const attacker = this.world.getUnit(attackerId);
        if (!attacker) {
            return 0;
        }

        const target = this.world.getUnit(targetId);
        if (!target) {
            return 0;
        }

        if (target.isDead()) {
            return 0;
        }

        const { world } = this;

        const targetHpBefore = target.hp;
        const defense = world.stats.getValue(target, StatType.Defense);
        let finalDamage = Math.max(1, rawDamage - defense);

        const damageTaken = world.stats.getValue(target, StatType.DamageTaken);

        finalDamage *= damageTaken;

        finalDamage = Math.max(1, finalDamage);

        const result = target.takeDamage(finalDamage);

        world.events.emit({
            type: BattleEventType.Damage,
            time: world.getTime(),

            attackerId,
            targetId,

            rawDamage,
            finalDamage,

            targetHpBefore,
            targetHpAfter: result.after,
        } as DamageEvent);

        if (target.isDead()) {
            world.events.emit({
                type: BattleEventType.UnitDied,
                time: world.getTime(),

                unitId: target.id,
            } as UnitDiedEvent);
        }

        return finalDamage;
    }

    public update(dt: number): void {}
}
