export enum TargetRelation {
    Self = "Self",
    Ally = "Ally",
    Enemy = "Enemy",
}

export enum TargetType {
    Single = "Single",

    LowestHp = "LowestHp",
    HighestHp = "HighestHp",

    All = "All",
}

export interface TargetQuery {
    relation: TargetRelation;

    type: TargetType;

    includeDead?: boolean;

    maxCount?: number;
}
