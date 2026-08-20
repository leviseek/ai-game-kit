import { BattleEvent } from "../runtime/event/BattleEvent";
import { BattleTimelineItem } from "./BattleTimelineItem";

export class BattleTimeline {
    private items: BattleTimelineItem[] = [];

    public build(events: readonly BattleEvent[]) {
        this.items.length = 0;

        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            this.items.push({
                time: event.time,
                sequence: event.sequence,
                event,
            });
        }

        this.items.sort((a, b) => {
            if (a.time !== b.time) {
                return a.time - b.time;
            }
            return a.sequence - b.sequence;
        });
    }

    public getItems(): readonly BattleTimelineItem[] {
        return this.items;
    }

    public getDuration(): number {
        if (this.items.length === 0) {
            return 0;
        }

        return this.items[this.items.length - 1].time;
    }

    public findAt(time: number): BattleTimelineItem | null {
        if (this.items.length === 0) {
            return null;
        }

        let closet = this.items[0];
        let distance = Math.abs(closet.time - time);

        for (let i = 1; i < this.items.length; i++) {
            const item = this.items[i];
            const nextDistance = Math.abs(item.time - time);

            if (nextDistance < distance) {
                closet = item;
                distance = nextDistance;
            }
        }

        return closet;
    }
}
