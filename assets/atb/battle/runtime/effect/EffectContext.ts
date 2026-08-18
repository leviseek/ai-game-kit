export interface EffectContext {
    sourceId: string;
    targetId: string;
    skillId?: string;
    buffId?: string;
    effectIndex: number;
    tickIndex?: number;
    time: number;
    tags?: string[];
}
