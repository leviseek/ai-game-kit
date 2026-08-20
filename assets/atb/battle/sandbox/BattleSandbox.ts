import { _decorator, Component, RichText, Touch } from "cc";
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

    private controller: BattleSandboxController | null = null;
    private eventLog: BattleSandboxEventLog | null = null;

    private accumulator = 0;

    private readonly FIXED_DT = 0.02;

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
        if (!this.controller) return;

        const state = this.controller.state;
        if (state.paused) return;

        this.accumulator += dt * this.controller.state.speed;

        while (this.accumulator >= this.FIXED_DT) {
            this.controller.world.step(this.FIXED_DT);
            state.currentTime = this.controller.world.getTime();

            this.accumulator -= this.FIXED_DT;
        }

        // 暂停只挡推进、不挡刷新：单步（step）产生的事件在暂停态下也能同步到视图
        if (this._upTime < this._upInterval) {
            this._upTime += dt;
            return;
        }

        if (!this._logDirty) return;

        this._logDirty = false;
        this._upTime = 0;

        this.syncViews();
    }

    createWorld() {
        const world = BattleFactory.create(TestBattle);
        return world;
    }

    private syncViews() {
        this.refreshUnitViews();
        this.refreshUnitInspector();
        this.refreshLogs();
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

    public onClickPlay() {
        this.controller?.play();
    }

    public onClickPause() {
        this.controller?.pause();
    }

    public onClickStep() {
        this.controller?.step(0.1);

        this.syncViews();
    }

    public onClickReset() {
        this.controller?.reset();
    }

    public onClickRestart() {
        this.controller?.restart();
    }

    public onClickSpeed(event: Event, edata: string) {
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
