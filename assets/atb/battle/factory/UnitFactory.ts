import { BattleWorld } from "../runtime/BattleWorld";
import { BattleUnit } from "../runtime/BattleUnit";
import { UnitData } from "../data/units/UnitData";
import { SkillData } from "../data/skills/SkillData";

export class UnitFactory {
    constructor(private readonly world: BattleWorld) {}

    public create(data: UnitData): BattleUnit {
        const unit = new BattleUnit(data.id, data.team);

        unit.name = data.name;
        unit.maxHp = data.maxHp;
        unit.hp = data.maxHp;
        unit.attack = data.attack;
        unit.defense = data.defense;
        unit.maxEnergy = data.maxEnergy;
        unit.energy = data.initialEnergy;
        unit.energyRegen = data.energyRegen;
        unit.autoBattle = data.autoBattle;

        const skills: SkillData[] = [];
        for (const skillId of data.skills) {
            const skill = this.world.skillReg.get(skillId);
            skills.push(skill);
        }

        unit.setSkills(skills);
        this.world.addUnit(unit);

        return unit;
    }
}
