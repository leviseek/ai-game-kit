import { EffectData } from "../../runtime/effect/EffectData";
import { BuffModifier } from "../../runtime/buff/BuffModifier";

export interface BuffPeriodicEffect {
    interval: number;
    effects: EffectData[];
}

export interface BuffData {
    id: string;
    name: string;
    duration: number;
    maxStacks: number;
    modifiers?: BuffModifier[];
    periodic?: BuffPeriodicEffect;
}
