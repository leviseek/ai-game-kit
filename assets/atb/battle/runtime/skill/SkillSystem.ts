import { BattleEventType, SkillFinishedEvent, SkillStartedEvent } from "../event/BattleEvent";
import { BattleSystem } from "../system/BattleSystem";
import { SkillData } from "./SkillData";

export class SkillSystem extends BattleSystem {
    protected readonly TAG: string = "SkillSystem";

    private coldowns: Map<string, number> = new Map();

    public update(dt: number): void {
        for (const [key, remaining] of this.coldowns) {
            const next = Math.max(0, remaining - dt);

            if (next <= 0) {
                this.coldowns.delete(key);
            } else {
                this.coldowns.set(key, next);
            }
        }
    }

    public cast(casterId: string, skill: SkillData): boolean {
        const caster = this.world.getUnit(casterId);
        if (!caster) return false;

        if (caster.isDead()) return false;

        const key = this.getColdownKey(casterId, skill.id);
        const colddown = this.coldowns.get(key) ?? 0;
        if (colddown > 0) {
            return false;
        }

        const targets = this.world.targetSelector.select(caster, skill.target);
        if (targets.length == 0) {
            return false;
        }

        this.world.events.emit({
            type: BattleEventType.SkillStarted,
            time: this.world.getTime(),
            casterId: casterId,
            skillId: skill.id,
        } as SkillStartedEvent);

        for (const target of targets) {
            this.world.effectPipeline.apply(
                {
                    sourceId: caster.id,
                    targetId: target.id,
                    skillId: skill.id,
                    time: this.world.getTime(),
                    tags: ["skill"],
                },
                skill.effects,
            );
        }

        this.world.events.emit({
            type: BattleEventType.SkillFinished,
            time: this.world.getTime(),
            casterId: casterId,
            skillId: skill.id,
        } as SkillFinishedEvent);

        this.coldowns.set(key, skill.cooldown);

        return true;
    }

    private getColdownKey(casterId: string, skillId: string): string {
        return `${casterId}:${skillId}`;
    }
}
