import { _decorator, Component, Node } from "cc";
import { BattleWorld } from "../runtime/BattleWorld";
import { BattleEventType, DamageEvent, UnitDiedEvent } from "../runtime/event/BattleEvent";
import { AttackCommand } from "../runtime/command/AttackCommand";
import { BattleCampType } from "../runtime/BattleUnit";
import { TargetRelation, TargetType } from "../runtime/target/TargetQuery";
import { SkillData } from "../runtime/skill/SkillData";
import { EffectType } from "../runtime/effect/EffectData";
import { SkillCommand } from "../runtime/skill/SkilCommand";
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

        // test multi times damage
        // this.multiDamage();

        // test scheduler time scale
        // this.scaleTime();

        // test scheduler pause
        // this.pauseAndResume();

        // test target select
        // this.selectTarget();

        // test fireball
        this.testFireball();

        // scheduler start
        scheduler.start();
    }

    private testPauseAndResume() {
        const { scheduler } = this.world;
        setTimeout(() => {
            scheduler.pause();
        }, 1500);

        setTimeout(() => {
            scheduler.start();
        }, 5000);
    }

    private testScaleTime() {
        const { scheduler } = this.world;
        scheduler.setTimeScale(2.0);
    }

    private testMultiDamage() {
        const { scheduler } = this.world;
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
    }

    private testSelectTarget() {
        const hero = this.world.getUnit("hero_001");
        if (!hero) {
            return;
        }

        const targets = this.world.targetSelector.select(hero, {
            relation: TargetRelation.Enemy,
            type: TargetType.LowestHp,
        });

        console.log(
            "[TargetSelector]",
            targets.map((target) => target.id),
        );
    }

    private testFireball() {
        const { scheduler } = this.world;

        const fireball = this.createFireball();
        scheduler.schedule(1.0, new SkillCommand("hero_001", fireball));

        scheduler.schedule(2.0, new SkillCommand("hero_001", fireball));

        scheduler.schedule(5.0, new SkillCommand("hero_001", fireball));

        scheduler.schedule(10, new SkillCommand("hero_001", fireball));
    }

    private createFireball(): SkillData {
        return {
            id: "fireball",
            name: "Fireball",
            cooldown: 5,
            cost: 20,
            target: {
                relation: TargetRelation.Enemy,
                type: TargetType.All,
            },
            effects: [
                {
                    type: EffectType.Damage,
                    value: 50,
                },
            ],
        };
    }
}
