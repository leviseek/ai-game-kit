import { _decorator, Component } from "cc";
import { BattleWorld } from "../runtime/BattleWorld";
import { BattleEventType, DamageEvent, UnitDiedEvent } from "../runtime/event/BattleEvent";
import { TestBattle } from "../data/battles/TestBattleData";
import { BattleFactory } from "../factory/BattleFactory";
const { ccclass } = _decorator;

/**
 * 战斗沙盒
 */
@ccclass("BattleSandbox")
export class BattleSandbox extends Component {
    private static readonly TAG = "BattleSandbox";
    private world: BattleWorld | undefined;

    start() {
        this.createBattle();
    }

    update(dt: number) {
        this.world?.update(dt);
    }

    private setupEventListeners() {
        this.world?.events.on(BattleEventType.Damage, (evt) => {
            const damageEvt = evt as DamageEvent;
            console.log(`[Damage] ${damageEvt.sourceId} -> ${damageEvt.targetId} damage=${damageEvt.finalDamage} [hp] ${damageEvt.targetHpBefore} -> ${damageEvt.targetHpAfter}`);
        });

        this.world?.events.on(BattleEventType.UnitDied, (evt) => {
            const deathEvt = evt as UnitDiedEvent;
            console.log(`[Death] ${deathEvt.unitId}`);
        });

        // this.world.events.onAny((evt) => {
        //     console.log(`[${evt.type}]`, evt);
        // });
    }

    createBattle() {
        this.world = BattleFactory.create(TestBattle);

        this.setupEventListeners();

        this.world.scheduler.start();
    }
}
