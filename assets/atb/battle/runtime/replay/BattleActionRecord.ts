import { EffectContext } from "../effect/EffectContext";
import { EffectResult } from "../effect/EffectResult";

export interface BattleActionRecord {
    time: number;
    type: string;
    context?: EffectContext;
    result?: EffectResult;
}
