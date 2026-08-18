export interface DamageResult {
    rawDamage: number;
    finalDamage: number;
    actualDamage: number;
    targetHpBefore: number;
    targetHpAfter: number;
    killed: boolean;
}
