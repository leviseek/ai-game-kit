import { SkillData } from "../data/skills/SkillData";
import { SkillRuntimeState } from "./skill/SkillRuntimeState";

/**
 * 战斗单位
 */
export class BattleUnit {
    public readonly id: string;
    public readonly team: number;

    public name: string = "";
    public maxHp: number = 0;
    public hp: number = 0;

    public energy = 0;
    public maxEnergy = 100;
    public energyRegen = 10;

    public attack: number = 0;
    public defense: number = 0;

    private _skills: SkillData[] = [];
    private skillState: Map<string, SkillRuntimeState> = new Map();

    public autoBattle = false;

    constructor(id: string, team: number) {
        this.id = id;
        this.team = team;
    }

    public get skills(): SkillData[] {
        return this._skills;
    }

    public isDead(): boolean {
        return this.hp <= 0;
    }

    /**
     *
     * @deprecated
     */
    public calculateDamage(): number {
        return Math.max(1, this.attack);
    }

    public takeDamage(rawDamage: number): { before: number; after: number; actual: number } {
        const damage = Math.max(1, rawDamage - this.defense);

        const before = this.hp;
        this.hp = Math.max(0, this.hp - damage);

        return {
            before,
            after: this.hp,
            actual: this.hp - before,
        };
    }

    public heal(amount: number): {
        before: number;
        after: number;
        actual: number;
    } {
        if (this.isDead()) {
            return {
                before: this.hp,
                after: this.hp,
                actual: 0,
            };
        }

        const before = this.hp;

        this.hp = Math.min(this.maxHp, this.hp + Math.max(0, amount));

        return {
            before,
            after: this.hp,
            actual: this.hp - before,
        };
    }

    public addEnergy(amount: number): number {
        if (amount <= 0) {
            return 0;
        }

        const before = this.energy;

        this.energy = Math.min(this.maxEnergy, this.energy + amount);

        return this.energy - before;
    }

    public consumeEnergy(amount: number): boolean {
        if (amount <= 0) {
            return true;
        }

        if (this.energy < amount) {
            return false;
        }

        this.energy -= amount;

        return true;
    }

    public setSkills(skills: SkillData[]) {
        this._skills = [...skills];

        this.skillState.clear();

        for (const skill of this._skills) {
            this.skillState.set(skill.id, {
                skillId: skill.id,
                cooldownRemaining: 0,
            });
        }
    }

    public getSkillState(skillId: string): SkillRuntimeState | undefined {
        return this.skillState.get(skillId);
    }
}
