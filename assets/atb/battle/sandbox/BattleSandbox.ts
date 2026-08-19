import { _decorator, Component, Label, RichText, Touch } from "cc";
import { BattleWorld } from "../runtime/BattleWorld";
import { TestBattle } from "../data/battles/TestBattleData";
import { BattleFactory } from "../factory/BattleFactory";
import { BattleSandboxController } from "./BattleSandboxController";
import { BattleSandboxEventLog } from "./BattleSandboxEventLog";
import { BattleUnitView } from "./BattleUnitView";
import { BattleUnitInspector } from "./BattleUnitInspector";
const { ccclass, property } = _decorator;

/**
 * 战斗沙盒
 */
@ccclass("BattleSandbox")
export class BattleSandbox extends Component {
    private static readonly TAG = "BattleSandbox";

    @property(RichText)
    logLabel: RichText | null = null;

    @property(BattleUnitView)
    heroUnit: BattleUnitView | null = null;

    @property(BattleUnitView)
    enemyUnit: BattleUnitView | null = null;

    @property(BattleUnitInspector)
    unitInspector: BattleUnitInspector | null = null;

    private world: BattleWorld | undefined;

    private controller: BattleSandboxController | null = null;
    private eventLog: BattleSandboxEventLog | null = null;

    private _upInterval = 1;
    private _upTime = 0;
    private _logDirty = false;

    private _selectUnitId: string = "";

    start() {
        const world = this.createWorld();

        this.eventLog = new BattleSandboxEventLog();
        world.events.onAny((evt) => {
            this.eventLog?.push(evt);
            this._logDirty = true;
        });

        this.controller = new BattleSandboxController(world);

        world.scheduler.start();
    }

    update(dt: number) {
        this.world?.update(dt);
        if (!this.controller) return;

        const state = this.controller.state;
        if (state.paused) return;

        const scaleDt = dt * state.speed;
        this.controller.world.update(scaleDt);
        state.currentTime = this.controller.world.getTime();

        if (this._upTime < this._upInterval) {
            this._upTime += dt;
            return;
        }

        if (this._logDirty) {
            // refresh log

            this.refreshUnitViews();
            this.refreshUnitInspector();
            this.refreshLogs();
        }
    }

    createWorld() {
        const world = BattleFactory.create(TestBattle);
        return world;
    }

    private refreshUnitViews(): void {
        if (!this.controller) return;

        if (!this.heroUnit || !this.enemyUnit) return;

        const units = this.controller?.world.getAllUnits();
        if (!units || units.length === 0) {
            return;
        }

        this.heroUnit.bind(this.controller, units[0]);
        this.enemyUnit.bind(this.controller, units[1]);

        this.heroUnit.refresh(units[0]);
        this.enemyUnit.refresh(units[1]);
    }

    private refreshUnitInspector() {
        if (!this.controller) return;
        if (!this.enemyUnit || !this.heroUnit) return;
        if (this._selectUnitId === "") return;

        const unit = this.controller.getUnitInspector(this._selectUnitId);
        if (!unit) return;
        this.unitInspector?.refreshInspector(unit);
    }

    private refreshLogs() {
        const logs = this.eventLog?.getLastLogs();
        if (logs && logs.length > 0 && this.logLabel) {
            this.logLabel.string = logs.join("\n");
        }
    }

    public onClickPauseBtn() {
        this.controller?.pause();
    }

    public onClickResumeBtn() {
        this.controller?.resume();
    }

    public onClickStepBtn() {
        this.controller?.step(1);
    }

    public onClickSpeedBtn(event: Event, edata: string) {
        const speed = Number(edata);
        this.controller?.setSpeed(speed);
    }

    public onClickUnit(evt: Touch, edata: string) {
        if (!this.controller) return;
        if (!this.enemyUnit || !this.heroUnit) return;

        const unitView = edata === "enemy" ? this.enemyUnit : this.heroUnit;

        this.controller.selectUnit(unitView.unitId);
        this._selectUnitId = unitView.unitId;
    }
}
