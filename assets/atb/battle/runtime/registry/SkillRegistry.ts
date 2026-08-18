import { SkillData } from "../../data/skills/SkillData";

export class SkillRegistry {
    private readonly data: Map<string, SkillData> = new Map();

    public register(skill: SkillData) {
        if (this.data.has(skill.id)) {
            throw new Error(`Skill already registered: ${skill.id}`);
        }

        this.data.set(skill.id, skill);
    }

    public get(id: string): SkillData {
        const skill = this.data.get(id);
        if (!skill) {
            throw new Error(`Skill not found: ${id}`);
        }

        return skill;
    }

    public has(id: string): boolean {
        return this.data.has(id);
    }
}
