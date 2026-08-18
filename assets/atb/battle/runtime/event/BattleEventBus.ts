import { BattleEvent, BattleEventType } from "./BattleEvent";

type BattleEventListener = (event: BattleEvent) => void;

export class BattleEventBus {
    private static readonly TAG: string = "BattleEventBus";

    private listeners: Map<BattleEventType, BattleEventListener[]> = new Map();
    private anyListeners: Array<(event: BattleEvent) => void> = [];

    public on(type: BattleEventType, listener: BattleEventListener) {
        const list = this.listeners.get(type) || [];
        this.listeners.set(type, list);

        list.push(listener);
    }

    public onAny(listener: (event: BattleEvent) => void) {
        this.anyListeners.push(listener);
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
        const listeners = this.listeners.get(event.type);
        if (listeners) {
            for (const listener of listeners) {
                listener(event);
            }
        }

        for (const listener of this.anyListeners) {
            listener(event);
        }
    }

    public clear() {
        this.listeners.clear();
        this.anyListeners.length = 0;
    }
}
