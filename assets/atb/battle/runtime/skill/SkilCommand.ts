import { BattleWorld } from "../BattleWorld";
import { BattleCommand } from "../command/BattleCommand";
import { SkillData } from "./SkillData";

export class SkillCommand implements BattleCommand {
    constructor(
        public readonly casterId: string,
        public readonly skill: SkillData,
    ) {}

    execute(world: BattleWorld): void {
        world.skillSystem.cast(this.casterId, this.skill);
    }
}
