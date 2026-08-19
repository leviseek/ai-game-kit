import { _decorator, Component, Label, Node, ProgressBar } from "cc";
import { BattleUnit } from "../runtime/BattleUnit";
import { BattleSandboxController } from "./BattleSandboxController";
const { ccclass, property } = _decorator;

@ccclass("BattleUnitView")
export class BattleUnitView extends Component {
    @property(Label)
    nameLabel: Label | null = null;

    @property(ProgressBar)
    hpBar: ProgressBar | null = null;

    @property(Label)
    hpLabel: Label | null = null;

    @property(Label)
    energyLabel: Label | null = null;

    _controller: BattleSandboxController | null = null;

    _unitId: string = "";

    public get unitId(): string {
        return this._unitId;
    }

    public bind(controller: BattleSandboxController, unit: BattleUnit): void {
        if (this._controller) return;

        this._controller = controller;

        this._unitId = unit.id;

        if (this.nameLabel) {
            this.nameLabel.string = unit.name;
        }

        this.refresh(unit);
    }

    public refresh(unit: BattleUnit): void {
        if (this.hpBar) {
            this.hpBar.progress = unit.hp / unit.maxHp;
        }

        if (this.hpLabel) {
            this.hpLabel.string = `${unit.hp}/${unit.maxHp}`;
        }

        if (this.energyLabel) {
            this.energyLabel.string = `${unit.energy.toFixed(0)} / ${unit.maxEnergy}`;
        }
    }

    public onClickSelf() {
        if (!this._controller) return;

        this._controller.selectUnit(this._unitId);
    }
}
