import { BattleUnit } from "../BattleUnit";
import { BattleWorld } from "../BattleWorld";
import { ModifierType } from "../buff/BuffModifier";
import { StatType } from "./StatType";

export class StatCalculator {
    constructor(private readonly world: BattleWorld) {}

    public getValue(unit: BattleUnit, stat: StatType): number {
        const base = this.getBaseValue(unit, stat);

        const modifiers = this.world.buffSystem.getModifiers(unit, stat);

        let flat = 0;
        let percent = 0;

        for (const modifier of modifiers) {
            if (modifier.type === ModifierType.Add) {
                flat += modifier.value;
            } else if (modifier.type === ModifierType.Percent) {
                percent += modifier.value;
            }
        }

        return (base + flat) * (1 + percent);
    }

    private getBaseValue(unit: BattleUnit, stat: StatType): number {
        switch (stat) {
            case StatType.Attack:
                return unit.attack;
            case StatType.Defense:
                return unit.defense;
            case StatType.MaxHp:
                return unit.maxHp;
            case StatType.DamageDealt:
            case StatType.DamageTaken:
            case StatType.HealDone:
            case StatType.HealReceived:
                return 1;
            default:
                return 0;
        }
    }
}
