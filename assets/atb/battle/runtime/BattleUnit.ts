import { SkillData } from "../data/skills/SkillData";
import { BattleUnitSnapshot } from "../sandbox/BattleUnitSnapshot";
import { BattleInitialUnitState } from "./replay/BattleInitialState";
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

    public position: { x: number; y: number } = { x: 0, y: 0 };

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

    public clearCooldowns() {
        this.skillState.forEach((state) => {
            state.cooldownRemaining = 0;
        });
    }

    public createInitialState(): BattleInitialUnitState {
        return {
            id: this.id,

            name: this.name,

            team: this.team,

            hp: this.hp,

            maxHp: this.maxHp,

            energy: this.energy,

            maxEnergy: this.maxEnergy,

            energyRegen: this.energyRegen,

            x: this.position.x,

            y: this.position.y,

            autoBattle: this.autoBattle,
        };
    }

    public restoreInitialState(state: BattleInitialUnitState): void {
        this.hp = state.hp;

        this.maxHp = state.maxHp;

        this.energy = state.energy;

        this.maxEnergy = state.maxEnergy;

        this.energyRegen = state.energyRegen;

        this.autoBattle = state.autoBattle;

        this.restorePosition(state.x, state.y);

        this.clearRuntimeState();
    }

    private restorePosition(x: number, y: number) {
        //todo by levi
    }

    private clearRuntimeState(): void {
        //todo by levi
        // this.targetId = null;
        // this.currentAction = null;
        // this.cooldowns.clear();
        // this.buffs.clear();
        // this.isCasting = false;
        // this.stunTime = 0;
        // this.silenceTime = 0;
        // this.pendingCommands.clear();
    }

    public createSnapshot(): BattleUnitSnapshot {
        return {
            id: this.id,

            name: this.name,

            hp: this.hp,

            maxHp: this.maxHp,

            energy: this.energy,

            maxEnergy: this.maxEnergy,

            attack: this.attack,

            defense: this.defense,

            dead: this.isDead(),
        };
    }
}
