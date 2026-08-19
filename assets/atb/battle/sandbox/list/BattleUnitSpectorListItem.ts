import { _decorator, Label } from "cc";
import { ListViewItem } from "../../../ui/list/ListViewItem";
const { ccclass, property } = _decorator;

@ccclass("BattleUnitSpectorListItem")
export class BattleUnitSpectorListItem extends ListViewItem {
    @property(Label)
    nameLabel: Label | null = null;

    @property(Label)
    valueLabel: Label | null = null;

    start() {}

    update(deltaTime: number) {}

    protected onBind(_data: unknown, _index: number): void {
        const data = _data as { name: string; value: number | string };
        if (this.nameLabel) {
            this.nameLabel.string = data.name;
        }
        if (this.valueLabel) {
            let val = data.value;
            if (typeof data.value === "number") {
                val = data.value.toFixed(0);
            }
            this.valueLabel.string = `${val}`;
        }
    }

    protected onUnbind(): void {}
}
