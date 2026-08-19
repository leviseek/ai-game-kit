import { BattleEvent, BattleEventType, DamageEvent, DecisionMadeEvent, EnergyChangedEvent } from "../runtime/event/BattleEvent";

export class BattleSandboxEventLog {
    private events: BattleEvent[] = [];
    private logs: string[] = [];

    public push(event: BattleEvent) {
        this.events.push(event);

        const log = this.formatEvent(event);
        if (log !== "") {
            this.logs.push(log);
            if (this.logs.length > 10) {
                this.logs.shift();
            }
        }
    }

    public getAll(): readonly BattleEvent[] {
        return this.events;
    }

    public getLastLogs(): readonly string[] {
        return this.logs;
    }

    public clear() {
        this.events.length = 0;
        this.logs.length = 0;
    }

    private formatEvent(evt: BattleEvent): string {
        switch (evt.type) {
            case BattleEventType.Damage: {
                const event = evt as DamageEvent;
                return [`[${event.time.toFixed(2)}]`, "Damage", `${event.sourceId}`, "→", `${event.targetId}`, `${event.actualDamage}`].join(" ");
            }
            case BattleEventType.DecisionMade: {
                const event = evt as DecisionMadeEvent;
                return [`[${event.time.toFixed(2)}]`, "Decision", event.unitId, "→", event.skillId].join(" ");
            }
            case BattleEventType.EnergyChanged: {
                // const event = evt as EnergyChangedEvent;
                // return [`[${event.time.toFixed(2)}]`, "Energy", event.unitId, event.energy.toFixed(1)].join(" ");
            }
            default: {
                // const event = evt;
                // return [`[${event.time.toFixed(2)}]`, event.type].join(" ");
                return "";
            }
        }
    }
}
