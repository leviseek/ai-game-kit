import { _decorator, Component, Node } from "cc";
import { ListView } from "../../ui/list/ListView";
import { BattleUnitSnapshot } from "./BattleUnitSnapshot";
const { ccclass, property } = _decorator;

@ccclass("BattleUnitInspector")
export class BattleUnitInspector extends Component {
    @property(ListView)
    listView: ListView | null = null;

    start() {}

    update(deltaTime: number) {}

    refreshInspector(snap: BattleUnitSnapshot) {
        if (!this.listView) return;

        const itemList: { name: string; value: number }[] = [];

        const keys = Object.keys(snap);
        const values = Object.values(snap);
        for (const key in values) {
            itemList.push({
                name: keys[key],
                value: values[key],
            });
        }

        this.listView.setItems(itemList);
    }
}
