import { BattleEvent, BattleEventType } from "./BattleEvent";

type BattleEventListener = (event: BattleEvent) => void;

export class BattleEventBus {
    private static readonly TAG: string = "BattleEventBus";

    private listeners: Map<BattleEventType, BattleEventListener[]> = new Map();

    public on(type: BattleEventType, listener: BattleEventListener) {
        const list = this.listeners.get(type) || [];
        this.listeners.set(type, list);

        list.push(listener);
    }

    public off(type: BattleEventType, listener: BattleEventListener) {
        const list = this.listeners.get(type);
        if (!list) {
            return;
        }

        const index = list.indexOf(listener);
        if (index >= 0) {
            list.splice(index, 1);
        }
    }

    public emit(event: BattleEvent) {
        console.debug(`[${BattleEventBus.TAG}] ${event.type}: `, event);

        const list = this.listeners.get(event.type);
        if (!list) {
            return;
        }

        for (const listener of list) {
            listener(event);
        }
    }

    public clear() {
        this.listeners.clear();
    }
}
