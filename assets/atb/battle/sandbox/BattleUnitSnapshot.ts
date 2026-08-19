export interface BattleUnitSnapshot {
    id: string;

    name: string;

    hp: number;

    maxHp: number;

    energy: number;

    maxEnergy: number;

    attack: number;

    defense: number;

    dead: boolean;
}
