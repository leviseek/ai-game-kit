import { EffectData } from "../effect/EffectData";
import { BuffModifier } from "./BuffModifier";

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
