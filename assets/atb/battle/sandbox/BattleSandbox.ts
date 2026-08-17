import { _decorator, Component, Node } from "cc";
import { BattleWorld } from "../runtime/BattleWorld";
import { BattleEventType, DamageEvent, UnitDiedEvent } from "../runtime/event/BattleEvent";
import { AttackCommand } from "../runtime/command/AttackCommand";
import { BattleCampType } from "../runtime/BattleUnit";
import { TargetRelation, TargetType } from "../runtime/target/TargetQuery";
const { ccclass } = _decorator;

/**
 * 战斗沙盒
 */
@ccclass("BattleSandbox")
export class BattleSandbox extends Component {
    private static readonly TAG = "BattleSandbox";
    private world: BattleWorld = new BattleWorld();

    start() {
        this.setupEventListeners();

        this.createBattle();

        this.startBattle();
    }

    update(dt: number) {
        this.world.update(dt);
    }

    private setupEventListeners() {
        this.world.events.on(BattleEventType.Damage, (evt) => {
            const damageEvt = evt as DamageEvent;
            console.log(`[Damage] ${damageEvt.attackerId} -> ${damageEvt.targetId} damage=${damageEvt.finalDamage}`);

            // this.refreshUnitView(damageEvent.targetId);
        });

        this.world.events.on(BattleEventType.UnitDied, (evt) => {
            const deathEvt = evt as UnitDiedEvent;
            console.log(`[Death] ${deathEvt.unitId}`);
        });
    }

    private createBattle() {
        // 创建 Hero
        const hero = this.world.createUnit({
            id: "hero_001",
            name: "Hero",
            camp: BattleCampType.Player,
            maxHp: 100,
            attack: 30,
            defense: 5,
        });
        if (!hero) {
            return;
        }

        // 创建 Enemy
        this.world.createUnit({
            id: "enemy_001",
            name: "Enemy",
            camp: BattleCampType.Enemy,
            maxHp: 120,
            attack: 20,
            defense: 3,
        });

        this.world.createUnit({
            id: "enemy_002",
            name: "Enemy",
            camp: BattleCampType.Enemy,
            maxHp: 90,
            attack: 20,
            defense: 3,
        });

        console.log(`[${BattleSandbox.TAG}] Battle created.`);

        // test target select
        const targets = this.world.targetSelector.select(hero, {
            relation: TargetRelation.Enemy,
            type: TargetType.LowestHp,
        });

        console.log(
            "[TargetSelector]",
            targets.map((target) => target.id),
        );
    }

    startBattle() {
        const { scheduler } = this.world;
        scheduler.schedule(
            1.0,
            new AttackCommand(`hero_001`, {
                relation: TargetRelation.Enemy,
                type: TargetType.LowestHp,
                maxCount: 1,
            }),
        );

        scheduler.schedule(
            2.0,
            new AttackCommand(`enemy_001`, {
                relation: TargetRelation.Enemy,
                type: TargetType.LowestHp,
                maxCount: 1,
            }),
        );

        scheduler.schedule(
            3.0,
            new AttackCommand(`hero_001`, {
                relation: TargetRelation.Enemy,
                type: TargetType.HighestHp,
                maxCount: 1,
            }),
        );

        scheduler.schedule(
            4.0,
            new AttackCommand(`hero_001`, {
                relation: TargetRelation.Enemy,
                type: TargetType.All,
            }),
        );

        // test scheduler time scale
        // scheduler.setTimeScale(2);

        scheduler.start();

        // test scheduler pause
        // setTimeout(() => {
        //     scheduler.pause();
        // }, 1500);

        // setTimeout(() => {
        //     scheduler.start();
        // }, 5000);
    }
}
