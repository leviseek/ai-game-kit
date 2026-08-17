import { _decorator } from "cc";
import { BattleUnit, BattleUnitData } from "./BattleUnit";
import { BattleEventBus } from "./event/BattleEventBus";
import { AttackStartedEvent, BattleEventType, DamageEvent, UnitDiedEvent } from "./event/BattleEvent";
import { BattleScheduler } from "./BattleScheduler";

/**
 * 战斗世界
 */

export class BattleWorld {
    private static readonly TAG = "BattleWorld";
    private units: Map<string, BattleUnit> = new Map();

    public readonly events = new BattleEventBus();
    public readonly scheduler = new BattleScheduler();

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

        this.events.emit({
            type: BattleEventType.AttackStarted,
            time: this.getTime(),
            attackerId,
            targetId,
        } as AttackStartedEvent);

        const rawDamage = attacker.calculateDamage();

        const finalDamage = Math.max(1, rawDamage - target.defense);

        const result = target.takeDamage(finalDamage);

        this.events.emit({
            type: BattleEventType.Damage,
            time: this.getTime(),
            attackerId,
            targetId,
            rawDamage,
            finalDamage,
            targetHpBefore: result.before,
            targetHpAfter: result.after,
        } as DamageEvent);

        if (target.isDead()) {
            this.events.emit({
                type: BattleEventType.UnitDied,
                unitId: targetId,
                time: this.getTime(),
            } as UnitDiedEvent);
        }
    }

    public update(dt: number) {
        this.scheduler.update(dt, this);
    }

    public getTime(): number {
        return this.scheduler.getCurrentTime();
    }

    public clear(): void {
        this.units.clear();
        this.events.clear();
        this.scheduler.reset();
    }
}
