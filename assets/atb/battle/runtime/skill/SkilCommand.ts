import { BattleWorld } from "../BattleWorld";
import { BattleCommand } from "../command/BattleCommand";

export interface SkillCommandData {
    casterId: string;
    skillId: string;
    targetIds: string[];
}

export class SkillCommand implements BattleCommand {
    constructor(public readonly data: SkillCommandData) {}

    execute(world: BattleWorld): void {
        const { casterId, skillId, targetIds } = this.data;

        world.skillSystem.cast(casterId, skillId, targetIds);
    }
}
