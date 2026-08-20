export interface BattleInitialUnitState {
    id: string;

    name: string;

    team: number;

    hp: number;

    maxHp: number;

    energy: number;

    maxEnergy: number;

    energyRegen: number;

    x: number;

    y: number;

    autoBattle: boolean;
}

export interface BattleInitialState {
    units: BattleInitialUnitState[];
}
