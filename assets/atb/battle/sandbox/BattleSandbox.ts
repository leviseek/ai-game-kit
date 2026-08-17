import { _decorator, Component, Node } from "cc";
import { BattleWorld } from "../runtime/BattleWorld";
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
        this.createBattle();
    }

    update(deltaTime: number) {}

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

        this.node.addChild(hero.node);
        hero.node.setPosition(-150, 0);

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

        this.node.addChild(enemy.node);
        enemy.node.setPosition(150, 0);

        console.log(`[${BattleSandbox.TAG}] Battle created.`);

        this.scheduleOnce(() => {
            this.world.attack(`hero_001`, "enemy_001");
        }, 1);

        this.scheduleOnce(() => {
            this.world.attack(`enemy_001`, "hero_001");
        }, 2);

        this.scheduleOnce(() => {
            this.world.attack(`enemy_001`, "hero_001");
        }, 3);

        this.scheduleOnce(() => {
            this.world.attack(`hero_001`, "enemy_001");
        }, 4);
    }
}
