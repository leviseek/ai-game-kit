import { EffectData } from "../effect/EffectData";
import { TargetQuery } from "../target/TargetQuery";

export interface SkillData {
    id: string;
    name: string;
    cooldown: number;
    cost: number;
    target: TargetQuery;
    effects: EffectData[];
}
