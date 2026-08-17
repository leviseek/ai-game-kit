import { _decorator } from "cc";
import { BattleUnit, BattleUnitData } from "./BattleUnit";
import { BattleEventBus } from "./event/BattleEventBus";
import { BattleScheduler } from "./BattleScheduler";
import { DamageSystem } from "./system/DamageSystem";
import { AttackSystem } from "./system/AttackSystem";
import { TargetSelector } from "./target/TargetSelector";

/**
 * 战斗世界
 */

export class BattleWorld {
    private static readonly TAG = "BattleWorld";
    private units: Map<string, BattleUnit> = new Map();

    public readonly events = new BattleEventBus();
    public readonly scheduler = new BattleScheduler();

    public readonly targetSelector: TargetSelector;
    public readonly damageSystem: DamageSystem;
    public readonly attackSystem: AttackSystem;

    constructor() {
        this.targetSelector = new TargetSelector(this);
        this.damageSystem = new DamageSystem(this);
        this.attackSystem = new AttackSystem(this, this.damageSystem);
    }

    public createUnit(data: BattleUnitData): BattleUnit | undefined {
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

    public update(dt: number) {
        this.scheduler.update(dt, this);

        this.attackSystem.update(dt);
        this.damageSystem.update(dt);
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
