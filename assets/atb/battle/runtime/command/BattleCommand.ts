import { BattleWorld } from "../BattleWorld";

/**
 * 战斗 - 命令声明
 */
export interface BattleCommand {
    execute(world: BattleWorld): void;
}
