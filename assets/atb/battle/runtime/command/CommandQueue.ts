import { BattleWorld } from "../BattleWorld";
import { BattleCommand } from "./BattleCommand";

export interface QueueCommand {
    executeTime: number;
    order: number;
    command: BattleCommand;
}

export class CommandQueue {
    private commands: QueueCommand[] = [];

    private orderCounter = 0;

    public enqueue(executeTime: number, command: BattleCommand) {
        this.commands.push({
            executeTime,
            order: this.orderCounter++,
            command,
        });

        this.sort();
    }

    private sort() {
        this.commands.sort((a, b) => {
            if (a.executeTime !== b.executeTime) {
                return a.executeTime - b.executeTime;
            }
            return a.order - b.order;
        });
    }

    public executeDueCommands(world: BattleWorld, currentTime: number) {
        while (this.commands.length > 0) {
            const item = this.commands[0];

            if (item.executeTime > currentTime) {
                break;
            }

            this.commands.shift();

            item.command.execute(world);
        }
    }

    public clear() {
        this.commands.length = 0;
        this.orderCounter = 0;
    }

    public getSize(): number {
        return this.commands.length;
    }
}
