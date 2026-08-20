import { _decorator, Component, Label, Node } from "cc";
import { BattleTimelineItem } from "../BattleTimelineItem";
const { ccclass, property } = _decorator;

@ccclass("BattleTimelineEvent")
export class BattleTimelineEvent extends Component {
    @property(Label)
    valueLabel: Label | null = null;

    private item: BattleTimelineItem | null = null;
    private handler: ((item: BattleTimelineItem) => void) | null = null;

    protected onLoad(): void {}

    start() {}

    update(deltaTime: number) {}

    onClickSelf() {
        if (!this.item || !this.handler) return;

        this.handler(this.item);
    }

    public bind(item: BattleTimelineItem, handler: (item: BattleTimelineItem) => void) {
        this.item = item;
        this.handler = handler;
    }

    public refreshItem(text: string) {
        if (!this.item || !this.valueLabel) return;

        this.valueLabel.string = text;
    }
}
