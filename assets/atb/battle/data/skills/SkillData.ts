import { EffectData } from "../../runtime/effect/EffectData";
import { TargetQuery } from "../../runtime/target/TargetQuery";

export interface SkillData {
    id: string;
    name: string;
    cooldown: number;
    cost: number;
    target: TargetQuery;
    effects: EffectData[];
}
