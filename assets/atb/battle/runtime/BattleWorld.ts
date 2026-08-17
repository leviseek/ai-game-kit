import { _decorator, instantiate } from "cc";
import { BattleUnit, BattleUnitData } from "./BattleUnit";
import { ATBUtils } from "../utils/ATBUtils";
import { BattleEventBus } from "./event/BattleEventBus";
import { AttackStartedEvent, BattleEventType, DamageEvent, UnitDiedEvent } from "./event/BattleEvent";

/**
 * 战斗世界
 */

export class BattleWorld {
    private static readonly TAG = "BattleWorld";
    private units: Map<string, BattleUnit> = new Map();

    public readonly events = new BattleEventBus();

    private time = 0;

    public async createUnit(data: BattleUnitData): Promise<BattleUnit | undefined> {
        if (this.units.has(data.id)) {
            console.error(`BattleUnit already exists: ${data.id}`);
            return undefined;
        }

        const unit = new BattleUnit(data);

        this.units.set(data.id, unit);

        return unit;
    }

    public getUnit(id: string): BattleUnit | undefined {
        return this.units.get(id);
    }

    public getAllUnits(): BattleUnit[] {
        return Array.from(this.units.values());
    }

    public executeAttack(attackerId: string, targetId: string) {
        const attacker = this.units.get(attackerId);
        if (!attacker) {
            console.error(`Attacker not found: ${attackerId}`);
            return;
        }

        const target = this.units.get(targetId);
        if (!target) {
            console.error(`Attacker not found: ${attackerId}`);
            return;
        }

        if (attacker.isDead() || target.isDead()) {
            return;
        }

        const atkStartedEvt: AttackStartedEvent = { type: BattleEventType.AttackStarted, time: this.time, attackerId, targetId };

        this.events.emit(atkStartedEvt);

        const rawDamage = attacker.calculateDamage();

        const finalDamage = Math.max(1, rawDamage - target.defense);

        const result = target.takeDamage(finalDamage);

        const damageEvt: DamageEvent = {
            type: BattleEventType.Damage,
            time: this.time,
            attackerId,
            targetId,
            rawDamage,
            finalDamage,
            targetHpBefore: result.before,
            targetHpAfter: result.after,
        };
        this.events.emit(damageEvt);

        if (target.isDead()) {
            const diedEvt: UnitDiedEvent = {
                type: BattleEventType.UnitDied,
                unitId: targetId,
                time: this.time,
            };
            this.events.emit(diedEvt);
        }
    }

    public update(dt: number) {
        this.time += dt;
    }

    public getTime(): number {
        return this.time;
    }

    public clear(): void {
        this.units.clear();
        this.events.clear();
        this.time = 0;
    }
}
