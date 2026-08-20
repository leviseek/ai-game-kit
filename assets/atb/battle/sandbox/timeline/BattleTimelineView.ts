import { _decorator, Button, Component, instantiate, Label, Node, UITransform, Vec3 } from "cc";
import { BattleTimeline } from "../BattleTimeline";
import { BattleTimelineItem } from "../BattleTimelineItem";
import { BattleTimelineEvent } from "./BattleTimelineEvent";
const { ccclass, property } = _decorator;

@ccclass("BattleTimelineView")
export class BattleTimelineView extends Component {
    @property(Node)
    content: Node | null = null;

    @property(Node)
    playhead: Node | null = null;

    @property(Label)
    timeLabel: Label | null = null;

    @property(Node)
    eventPrefab: Node | null = null;

    @property
    pixelsPerSecond = 120;

    private timeline: BattleTimeline | null = null;

    private clickHandler: ((item: BattleTimelineItem) => void) | null = null;

    public bind(timeline: BattleTimeline) {
        this.timeline = timeline;

        this.refresh();
    }

    public setClickHandler(handler: (item: BattleTimelineItem) => void) {
        this.clickHandler = handler;
    }

    public refresh() {
        if (!this.timeline) return;

        if (!this.content) return;

        this.clearItems();

        const items = this.timeline.getItems();
        for (const item of items) {
            this.createItem(item);
        }

        this.updateContentWidth();
    }

    private createItem(item: BattleTimelineItem) {
        if (!this.content || !this.eventPrefab) return;

        const node = instantiate(this.eventPrefab);
        node.active = true;

        this.content.addChild(node);

        const x = item.time * this.pixelsPerSecond;

        node.setPosition(new Vec3(x, 0, 0));

        const eventItem = node.getComponent("BattleTimelineEvent") as BattleTimelineEvent;
        if (eventItem && this.clickHandler) {
            eventItem.bind(item, this.clickHandler);
            const text = this.formatEvent(item);
            eventItem.refreshItem(text);
        }
    }

    private clearItems() {
        if (!this.content) return;

        this.content.removeAllChildren();
    }

    private updateContentWidth() {
        if (!this.content || !this.timeline) return;

        const duration = Math.max(this.timeline.getDuration());

        const width = duration * this.pixelsPerSecond + 200;

        const transform = this.getComponent(UITransform);

        if (transform) {
            transform.setContentSize(width, transform.height);
        }
    }

    public setCurrentTime(time: number) {
        if (!this.playhead) return;
        const x = time * this.pixelsPerSecond;

        this.playhead.setPosition(x, 0, 0);

        if (this.timeLabel) {
            this.timeLabel.string = `${time.toFixed(2)} s`;
        }
    }

    private formatEvent(item: BattleTimelineItem): string {
        return `[${item.time.toFixed(2)}]` + item.event.type;
    }

    start() {}

    update(deltaTime: number) {}
}
