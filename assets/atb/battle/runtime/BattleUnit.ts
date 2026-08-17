import { _decorator } from "cc";

/**
 * 战斗单位的数据
 */
export interface BattleUnitData {
    id: string;
    name: string;

    maxHp: number;
    attack: number;
    defense: number;
}

/**
 * 战斗单位
 */
export class BattleUnit {
    public readonly id: string;
    public readonly name: string;

    public readonly maxHp: number;
    public hp: number;

    public readonly attack: number;
    public readonly defense: number;

    constructor(data: BattleUnitData) {
        this.id = data.id;
        this.name = data.name;

        this.maxHp = data.maxHp;
        this.hp = data.maxHp;

        this.attack = data.attack;
        this.defense = data.defense;
    }

    public isDead(): boolean {
        return this.hp <= 0;
    }

    public calculateDamage(): number {
        return Math.max(1, this.attack);
    }

    public takeDamage(rawDamage: number): { before: number; after: number } {
        const damage = Math.max(1, rawDamage - this.defense);

        const before = this.hp;
        this.hp = Math.max(0, this.hp - damage);

        return {
            before,
            after: this.hp,
        };
    }
}
