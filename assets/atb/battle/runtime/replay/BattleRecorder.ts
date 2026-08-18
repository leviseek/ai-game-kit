import { BattleEvent } from "../event/BattleEvent";

export class BattleRecorder {
    private records: BattleEvent[] = [];

    public record(event: BattleEvent) {
        this.records.push(event);
    }

    public getRecords(): readonly BattleEvent[] {
        return this.records;
    }

    public clear() {
        this.records.length = 0;
    }
}
