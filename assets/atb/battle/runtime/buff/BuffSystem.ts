import { BattleUnit } from "../BattleUnit";
import { EffectContext } from "../effect/EffectContext";
import { BattleEventType, BuffAddedEvent, BuffRemovedEvent, BuffStackChangedEvent } from "../event/BattleEvent";
import { StatType } from "../stat/StatType";
import { BattleSystem } from "../system/BattleSystem";
import { BuffInstance } from "./BuffInstance";
import { BuffModifier } from "./BuffModifier";

export class BuffSystem extends BattleSystem {
    protected readonly TAG: string = "BuffSystem";

    private instances: Map<string, Map<string, BuffInstance>> = new Map();

    public addBuff(target: BattleUnit, buffId: string, context?: EffectContext): boolean {
        const data = this.world.buffReg.get(buffId);
        if (!data) {
            console.warn(`[${this.TAG}] Unknown buff: ${buffId}`);
            return false;
        }

        let buffs = this.instances.get(target.id);
        if (!buffs) {
            buffs = new Map();
            this.instances.set(target.id, buffs);
        }

        const existing = buffs.get(buffId);
        if (existing) {
            existing.addStack();

            const changedEvt: BuffStackChangedEvent = {
                type: BattleEventType.BuffStackChanged,
                time: this.world.getTime(),
                targetId: target.id,
                buffId,
                stacks: existing.stacks,
                duration: existing.remaining,
                sourceId: existing.sourceId,
            };
            this.world.events.emit(changedEvt);
            return true;
        }

        const instance = new BuffInstance(data, context?.sourceId ?? target.id);
        buffs.set(buffId, instance);

        const addedEvt: BuffAddedEvent = {
            type: BattleEventType.BuffAdded,
            time: this.world.getTime(),
            sourceId: context?.sourceId,
            targetId: target.id,
            buffId,
            stacks: instance.stacks,
            duration: instance.remaining,
        };
        this.world.events.emit(addedEvt);

        return true;
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
                        const context: EffectContext = {
                            sourceId: buff.sourceId,
                            targetId: unit.id,
                            buffId: buff.data.id,
                            effectIndex: i,
                            tickIndex: buff.tickCount + i,

                            time: world.getTime(),
                            tags: ["periodic", "dot"],
                        };
                        for (const effect of buff.data.periodic.effects) {
                            world.effectSystem.apply(context, effect);
                        }
                    }

                    // 每消耗一个 periodic tick，tickCount 自增 1（0 起始，供 tickIndex 递增）
                    buff.tickCount += ticks;
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
