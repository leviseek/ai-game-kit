import { BattleUnit } from "../BattleUnit";
import { BattleEventType, SkillFinishedEvent, SkillStartedEvent } from "../event/BattleEvent";
import { BattleSystem } from "../system/BattleSystem";
import { SkillData } from "../../data/skills/SkillData";

export class SkillSystem extends BattleSystem {
    protected readonly TAG: string = "SkillSystem";

    public update(dt: number): void {
        for (const unit of this.world.getAllUnits()) {
            for (const skill of unit.skills) {
                const state = unit.getSkillState(skill.id);
                if (!state) {
                    continue;
                }

                state.cooldownRemaining = Math.max(0, state.cooldownRemaining - dt);
            }
        }
    }

    public canCast(caster: BattleUnit, skill: SkillData): boolean {
        if (caster.isDead()) return false;

        if (caster.energy < skill.cost) return false;

        if (this.isOnCooldown(caster, skill.id)) return false;

        return true;
    }

    public cast(casterId: string, skillId: string, targetIds: string[]): boolean {
        const caster = this.world.getUnit(casterId);
        if (!caster) return false;

        const skill = caster.skills.find((skill) => skill.id === skillId);

        if (!skill) return false;

        if (!this.canCast(caster, skill)) return false;

        if (!caster.consumeEnergy(skill.cost)) return false;

        const state = caster.getSkillState(skill.id);
        if (state) {
            state.cooldownRemaining = skill.cooldown;
        }

        this.world.emitEvent({
            type: BattleEventType.SkillStarted,
            time: this.world.getTime(),
            casterId: casterId,
            skillId: skill.id,
        } as SkillStartedEvent);

        for (const targetId of targetIds) {
            this.world.effectPipeline.apply(
                {
                    sourceId: caster.id,
                    targetId,
                    skillId: skill.id,
                    time: this.world.getTime(),
                    tags: ["skill"],
                },
                skill.effects,
            );
        }

        this.world.emitEvent({
            type: BattleEventType.SkillFinished,
            time: this.world.getTime(),
            casterId: casterId,
            skillId: skill.id,
        } as SkillFinishedEvent);

        return true;
    }

    private isOnCooldown(caster: BattleUnit, skillId: string): boolean {
        const state = caster.getSkillState(skillId);

        if (!state) {
            return false;
        }

        return state.cooldownRemaining > 0;
    }

    public reset() {
        for (const unit of this.world.getAllUnits()) {
            unit.clearCooldowns();
        }
    }
}
