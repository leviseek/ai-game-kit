import { BattleWorld } from "../BattleWorld";
import { BattleCommand } from "./BattleCommand";

export class AttackCommand implements BattleCommand {
    constructor(
        public readonly attackerId: string,
        public readonly targetId: string,
    ) {}

    execute(world: BattleWorld): void {
        world.executeAttack(this.attackerId, this.targetId);
    }
}
