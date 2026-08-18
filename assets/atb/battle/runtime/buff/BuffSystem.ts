import { BattleUnit } from "../BattleUnit";
import { BattleEventType, BuffAddedEvent, BuffRemovedEvent, BuffStackChangedEvent } from "../event/BattleEvent";
import { BattleSystem } from "../system/BattleSystem";
import { BuffData } from "./BuffData";
import { BuffInstance } from "./BuffInstance";

export class BuffSystem extends BattleSystem {
    protected readonly TAG: string = "BuffSystem";

    private definitions: Map<string, BuffData> = new Map();

    private instances: Map<string, Map<string, BuffInstance>> = new Map();

    public update(dt: number) {
        for (const [unitId, buffs] of this.instances) {
            for (const [buffId, buff] of buffs) {
                if (buff.update(dt)) {
                    buffs.delete(buffId);

                    this.world.events.emit({
                        type: BattleEventType.BuffRemoved,
                        time: this.world.getTime(),
                        targetId: unitId,
                        buffId: buffId,
                    } as BuffRemovedEvent);
                }
            }

            if (buffs.size === 0) {
                this.instances.delete(unitId);
            }
        }
    }

    public register(data: BuffData) {
        this.definitions.set(data.id, data);
    }

    public addBuff(target: BattleUnit, buffId: string) {
        const data = this.definitions.get(buffId);
        if (!data) {
            console.log(`[${this.TAG}] Buff not found: ${buffId}`);
            return;
        }

        let unitBuffs = this.instances.get(target.id);
        if (!unitBuffs) {
            unitBuffs = new Map();
            this.instances.set(target.id, unitBuffs);
        }

        const existing = unitBuffs.get(buffId);
        if (existing) {
            existing.addStack();

            this.world.events.emit({
                type: BattleEventType.BuffStackChanged,
                time: this.world.getTime(),
                targetId: target.id,
                buffId,
                stacks: existing.stacks,
                duration: existing.reamining,
            } as BuffStackChangedEvent);
            return;
        }

        const instance = new BuffInstance(data);
        unitBuffs.set(buffId, instance);

        this.world.events.emit({
            type: BattleEventType.BuffAdded,
            time: this.world.getTime(),
            targetId: target.id,
            buffId,
            stacks: instance.stacks,
            duration: instance.reamining,
        } as BuffAddedEvent);
    }

    public getBuff(targetId: string, buffId: string): BuffInstance | undefined {
        return this.instances.get(targetId)?.get(buffId);
    }
}
