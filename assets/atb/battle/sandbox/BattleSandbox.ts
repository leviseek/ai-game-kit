import { _decorator, Component, Node } from "cc";
import { BattleWorld } from "../runtime/BattleWorld";
import { BattleEventType, DamageEvent, UnitDiedEvent } from "../runtime/event/BattleEvent";
import { AttackCommand } from "../runtime/command/AttackCommand";
const { ccclass, property } = _decorator;

/**
 * 战斗沙盒
 */
@ccclass("BattleSandbox")
export class BattleSandbox extends Component {
    private static readonly TAG = "BattleSandbox";
    private world: BattleWorld = new BattleWorld();

    private heroNode: Node | null = null;
    private enemyNode: Node | null = null;

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

    private async createBattle() {
        // 创建 Hero
        const hero = await this.world.createUnit({
            id: "hero_001",
            name: "Hero",
            maxHp: 100,
            attack: 30,
            defense: 5,
        });
        if (!hero) {
            return;
        }

        // 创建 Enemy
        const enemy = await this.world.createUnit({
            id: "enemy_001",
            name: "Enemy",
            maxHp: 120,
            attack: 20,
            defense: 3,
        });
        if (!enemy) {
            return;
        }

        console.log(`[${BattleSandbox.TAG}] Battle created.`);
    }

    startBattle() {
        this.scheduleOnce(() => {
            const command = new AttackCommand(`hero_001`, "enemy_001");

            command.execute(this.world);
        }, 1);

        this.scheduleOnce(() => {
            const command = new AttackCommand(`enemy_001`, "hero_001");

            command.execute(this.world);
        }, 2);

        this.scheduleOnce(() => {
            const command = new AttackCommand(`hero_001`, "enemy_001");

            command.execute(this.world);
        }, 3);

        this.scheduleOnce(() => {
            const command = new AttackCommand(`hero_001`, "enemy_001");

            command.execute(this.world);
        }, 4);
    }
}
