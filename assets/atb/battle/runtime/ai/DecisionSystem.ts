import { BattleUnit } from "../BattleUnit";
import { BattleEventType, DecisionMadeEvent } from "../event/BattleEvent";
import { SkillCommand, SkillCommandData } from "../skill/SkilCommand";
import { BattleSystem } from "../system/BattleSystem";
import { SkillDecision } from "./SkillDecision";

export class DecisionSystem extends BattleSystem {
    protected TAG: string = "DecisionSystem";

    public update(dt: number): void {
        const { world } = this;

        for (const unit of world.getAllUnits()) {
            if (unit.isDead()) continue;

            if (!unit.autoBattle) continue;

            const decision = this.decide(unit);
            if (!decision) continue;

            const madeEvt: DecisionMadeEvent = {
                type: BattleEventType.DecisionMade,

                time: this.world.getTime(),

                unitId: decision.casterId,

                skillId: decision.skillId,

                targetIds: decision.targetIds,
            };

            this.emitEvent(madeEvt);

            this.submit(decision);
        }
    }

    private decide(unit: BattleUnit): SkillDecision | null {
        const skills = unit.skills;
        const { world } = this;
        const { skillSystem, targetSelector } = world;
        let skillDecision: SkillDecision | null = null;
        for (const skill of skills) {
            if (!skillSystem.canCast(unit, skill)) continue;

            const targets = targetSelector.select(unit, skill.target);

            if (targets.length === 0) continue;

            skillDecision = {
                casterId: unit.id,
                skillId: skill.id,
                targetIds: targets.map((target) => target.id),
                priority: 0,
            };
            break;
        }

        return skillDecision;
    }

    private submit(decision: SkillDecision) {
        const data: SkillCommandData = {
            casterId: decision.casterId,
            skillId: decision.skillId,
            targetIds: decision.targetIds,
        };
        const command = new SkillCommand(data);
        this.world.scheduler.schedule(0, command);
    }

    public reset() {
        //todo by levi
        // this.pendingCommands.clear();
    }
}
