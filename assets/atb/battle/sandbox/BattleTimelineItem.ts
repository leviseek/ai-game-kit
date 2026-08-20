import { BattleEvent, BattleEventType } from "../runtime/event/BattleEvent";

export interface BattleTimelineItem {
    time: number;
    sequence: number;
    event: BattleEvent;
}
