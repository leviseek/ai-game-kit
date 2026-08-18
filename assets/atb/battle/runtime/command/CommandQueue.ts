import { BattleCommand } from "./BattleCommand";

interface ScheduledCommand {
    executeAt: number;

    sequence: number;

    command: BattleCommand;
}

export class CommandQueue {
    private commands: ScheduledCommand[] = [];

    private sequence = 0;

    public push(executeAt: number, command: BattleCommand) {
        this.commands.push({ executeAt, sequence: this.sequence++, command });

        this.sort();
    }

    public popDue(time: number): ScheduledCommand[] {
        const result: ScheduledCommand[] = [];
        while (this.commands.length > 0) {
            const first = this.commands[0];

            if (first.executeAt > time) {
                break;
            }

            result.push(this.commands.shift()!);
        }

        return result;
    }

    private sort() {
        this.commands.sort((a, b) => {
            if (a.executeAt !== b.executeAt) {
                return a.executeAt - b.executeAt;
            }
            return a.sequence - b.sequence;
        });
    }

    public clear() {
        this.commands.length = 0;
    }
}
