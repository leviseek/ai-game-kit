import { BattleWorld } from "../BattleWorld";
import { TargetQuery } from "../target/TargetQuery";
import { BattleCommand } from "./BattleCommand";

export class AttackCommand implements BattleCommand {
    constructor(
        public readonly attackerId: string,
        public readonly targetQuery: TargetQuery,
    ) {}

    execute(world: BattleWorld): void {
        const attacker = world.getUnit(this.attackerId);
        if (!attacker) {
            return;
        }

        const targets = world.targetSelector.select(attacker, this.targetQuery);

        for (const target of targets) {
            world.attackSystem.attack(attacker.id, target.id);
        }
    }
}
