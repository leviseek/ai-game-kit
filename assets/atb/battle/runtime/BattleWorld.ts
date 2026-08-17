import { _decorator, instantiate } from "cc";
import { BattleUnit, BattleUnitData } from "./BattleUnit";
import { ATBUtils } from "../utils/ATBUtils";

/**
 * 战斗世界
 */

export class BattleWorld {
    private static readonly TAG = "BattleWorld";
    private units: Map<string, BattleUnit> = new Map();

    public async createUnit(data: BattleUnitData): Promise<BattleUnit | undefined> {
        if (this.units.has(data.id)) {
            console.error(`BattleUnit already exists: ${data.id}`);
            return undefined;
        }

        const prefab = await ATBUtils.getPrefabByName("BattleUnit");

        if (!prefab) return undefined;

        const node = instantiate(prefab);
        const unit = node.getComponent(BattleUnit);
        if (!unit) return undefined;

        unit.setData(data);
        this.units.set(data.id, unit);

        return unit;
    }

    public getUnit(id: string): BattleUnit | undefined {
        return this.units.get(id);
    }

    public getAllUnits(): BattleUnit[] {
        return Array.from(this.units.values());
    }

    public attack(attackerId: string, targetId: string): number {
        const attacker = this.units.get(attackerId);
        if (!attacker) {
            console.error(`Attacker not found: ${attackerId}`);
            return 0;
        }

        const target = this.units.get(targetId);
        if (!target) {
            console.error(`Attacker not found: ${attackerId}`);
            return 0;
        }

        const damage = attacker.attackTarget(target);

        console.log(`[${BattleWorld.TAG}] ${attacker.name} attacks ${target.name}, damage=${damage}, targetHP=${target.hp}`);

        if (target.isDead()) {
            console.log(`[${BattleWorld.TAG}] ${target.name} is died.`);
        }

        return damage;
    }

    public clear(): void {
        this.units.clear();
    }
}
