import { StatType } from "../stat/StatType";

export enum ModifierType {
    Add = "Add",
    Percent = "Percent",
}

export interface BuffModifier {
    stat: StatType;
    type: ModifierType;
    value: number;
}
