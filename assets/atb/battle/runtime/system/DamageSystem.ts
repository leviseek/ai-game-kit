import { BattleEventType, DamageEvent, UnitDiedEvent } from "../event/BattleEvent";
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

        const targetHpBefore = target.hp;
        const finalDamage = Math.max(1, rawDamage - target.defense);

        const result = target.takeDamage(finalDamage);

        const { world } = this;

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
