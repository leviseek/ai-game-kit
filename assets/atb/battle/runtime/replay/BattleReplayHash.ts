import { BattleEvent } from "../event/BattleEvent";

export function createBattleEventHash(events: readonly BattleEvent[]): string {
    const text = events.map((event) => JSON.stringify(event)).join("|");

    let hash = 0;

    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }

    return String(hash);
}
