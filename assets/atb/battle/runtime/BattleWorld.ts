import { BattleUnit } from "./BattleUnit";
import { BattleEventBus } from "./event/BattleEventBus";
import { BattleScheduler } from "./BattleScheduler";
import { DamageSystem } from "./system/DamageSystem";
import { AttackSystem } from "./system/AttackSystem";
import { TargetSelector } from "./target/TargetSelector";
import { SkillSystem } from "./skill/SkillSystem";
import { EffectSystem } from "./effect/EffectSystem";
import { BuffSystem } from "./buff/BuffSystem";
import { EffectPipeline } from "./effect/EffectPipeline";
import { StatCalculator } from "./stat/StatCalculator";
import { BattleClock } from "./BattleClock";
import { BattleRecorder } from "./replay/BattleRecorder";
import { EnergySystem } from "./energy/EnergySystem";
import { BuffRegistry } from "./registry/BuffRegistry";
import { SkillRegistry } from "./registry/SkillRegistry";
import { UnitRegistry } from "./registry/UnitRegistry";
import { DecisionSystem } from "./ai/DecisionSystem";
import { BattleInitialState } from "./replay/BattleInitialState";
import { BattleEvent } from "./event/BattleEvent";

/**
 * 战斗世界
 */

export class BattleWorld {
    private static readonly TAG = "BattleWorld";

    // ===== Definition =====
    public readonly unitReg: UnitRegistry;
    public readonly skillReg: SkillRegistry;
    public readonly buffReg: BuffRegistry;

    // ===== Tools =====
    public readonly clock: BattleClock;
    public readonly events = new BattleEventBus();
    public readonly recorder: BattleRecorder;
    public readonly scheduler: BattleScheduler;

    // ===== Systems =====
    public readonly decisionSystem: DecisionSystem;
    public readonly damageSystem: DamageSystem;
    public readonly buffSystem: BuffSystem;
    public readonly stats: StatCalculator;
    public readonly effectSystem: EffectSystem;
    public readonly effectPipeline: EffectPipeline;
    public readonly targetSelector: TargetSelector;
    public readonly skillSystem: SkillSystem;
    public readonly attackSystem: AttackSystem;
    public readonly energySystem: EnergySystem;

    // ===== Runtime =====
    private readonly units: Map<string, BattleUnit> = new Map();
    private initialState: BattleInitialState | null = null;
    private eventSequence = 0;

    constructor() {
        this.unitReg = new UnitRegistry();
        this.skillReg = new SkillRegistry();
        this.buffReg = new BuffRegistry();

        this.clock = new BattleClock();
        this.scheduler = new BattleScheduler(this);
        this.recorder = new BattleRecorder();

        this.decisionSystem = new DecisionSystem(this);
        this.damageSystem = new DamageSystem(this);
        this.buffSystem = new BuffSystem(this);
        this.stats = new StatCalculator(this);
        this.effectSystem = new EffectSystem(this, this.damageSystem);
        this.effectPipeline = new EffectPipeline(this);
        this.targetSelector = new TargetSelector(this);
        this.skillSystem = new SkillSystem(this);
        this.attackSystem = new AttackSystem(this, this.damageSystem);
        this.energySystem = new EnergySystem(this);

        this.events.onAny((event) => this.recorder.record(event));
    }

    public addUnit(unit: BattleUnit): boolean {
        if (this.units.has(unit.id)) {
            console.error(`BattleUnit already exists: ${unit.id}`);
            return false;
        }
        this.units.set(unit.id, unit);

        return true;
    }

    public getUnit(id: string): BattleUnit | undefined {
        return this.units.get(id);
    }

    public getAllUnits(): BattleUnit[] {
        return Array.from(this.units.values());
    }

    public update(dt: number) {
        const battleDt = this.scheduler.update(dt, this);

        if (battleDt <= 0) {
            return;
        }

        this.runSystems(battleDt);
    }

    public step(dt: number) {
        this.runSystems(this.scheduler.update(dt, this, true));
    }

    private runSystems(battleDt: number) {
        if (battleDt <= 0) return;
        this.energySystem.update(battleDt);
        this.decisionSystem.update(battleDt);
        this.buffSystem.update(battleDt);
        this.attackSystem.update(battleDt);
        this.damageSystem.update(battleDt);
        this.skillSystem.update(battleDt);
    }

    public emitEvent(event: BattleEvent) {
        event.sequence = this.eventSequence++;

        this.events.emit(event);
    }

    public getTime(): number {
        return this.clock.getTime();
    }

    public captureInitialState(): void {
        this.initialState = {
            units: this.getAllUnits().map((unit) => unit.createInitialState()),
        };
    }

    private restoreInitialState(state: BattleInitialState): void {
        for (const initialUnit of state.units) {
            const unit = this.getUnit(initialUnit.id);

            if (!unit) {
                continue;
            }

            unit.restoreInitialState(initialUnit);
        }
    }

    public reset() {
        if (!this.initialState) {
            throw new Error("BattleWorld initial state has not been captured.");
        }

        this.clock.reset();

        this.scheduler.reset();

        this.decisionSystem.reset();
        this.buffSystem.reset();
        this.skillSystem.reset();

        this.recorder.clear();

        // this.events.clear();

        this.eventSequence = 0;

        this.restoreInitialState(this.initialState);
    }

    public clear(): void {
        this.units.clear();
        this.events.clear();
        this.scheduler.reset();

        this.eventSequence = 0;
    }
}
