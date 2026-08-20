import { BattleWorld } from "../BattleWorld";
import { AttackStartedEvent, BattleEventType } from "../event/BattleEvent";
import { StatType } from "../stat/StatType";
import { BattleSystem } from "./BattleSystem";
import { DamageSystem } from "./DamageSystem";

export class AttackSystem extends BattleSystem {
    protected readonly TAG: string = "AttackSystem";

    constructor(
        world: BattleWorld,
        private damageSystem: DamageSystem,
    ) {
        super(world);
    }

    public attack(attackerId: string, targetId: string) {
        const { world } = this;
        const attacker = world.getUnit(attackerId);
        if (!attacker) return;

        const target = world.getUnit(targetId);
        if (!target) return;

        if (attacker.isDead() || target.isDead()) return;

        const startedEvt: AttackStartedEvent = {
            type: BattleEventType.AttackStarted,
            time: world.getTime(),

            attackerId,
            targetId,
            sequence: 0,
        };
        world.emitEvent(startedEvt);

        const rawDamage = this.world.stats.getValue(attacker, StatType.Attack);

        this.damageSystem.dealDamage(attackerId, targetId, rawDamage);
    }

    public update(dt: number): void {}
}
