import { BattleUnit } from "../BattleUnit";
import { BattleEventType, BuffAddedEvent, BuffRemovedEvent, BuffStackChangedEvent } from "../event/BattleEvent";
import { StatType } from "../stat/StatType";
import { BattleSystem } from "../system/BattleSystem";
import { BuffData } from "./BuffData";
import { BuffInstance } from "./BuffInstance";
import { BuffModifier } from "./BuffModifier";

export class BuffSystem extends BattleSystem {
    protected readonly TAG: string = "BuffSystem";

    private definitions: Map<string, BuffData> = new Map();

    private instances: Map<string, Map<string, BuffInstance>> = new Map();

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
                duration: existing.remaining,
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
            duration: instance.remaining,
        } as BuffAddedEvent);
    }

    public getBuff(targetId: string, buffId: string): BuffInstance | undefined {
        return this.instances.get(targetId)?.get(buffId);
    }

    public getModifiers(unit: BattleUnit, stat: StatType): BuffModifier[] {
        const result: BuffModifier[] = [];
        const buffs = this.instances.get(unit.id);

        if (!buffs) {
            return result;
        }

        for (const buff of buffs.values()) {
            for (const modifier of buff.getModifiers()) {
                if (modifier.stat === stat) {
                    result.push(modifier);
                }
            }
        }

        return result;
    }

    public update(dt: number) {
        const { world } = this;
        for (const [unitId, buffs] of this.instances) {
            const unit = world.getUnit(unitId);
            if (!unit) {
                continue;
            }

            for (const [buffId, buff] of buffs) {
                buff.update(dt);

                const ticks = buff.consumePeriodicTicks();

                if (ticks > 0 && buff.data.periodic) {
                    for (let i = 0; i < ticks; i++) {
                        for (const effect of buff.data.periodic.effects) {
                            world.effectSystem.apply(unit, unit, effect);
                        }
                    }
                }

                if (buff.remaining <= 0) {
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
}
