import { _decorator, Component, Label, Node } from 'cc';
const { ccclass, property } = _decorator;

/**
 * 战斗单位的数据
 */
export interface BattleUnitData {
    id: string;
    name: string;

    maxHp: number;
    attack: number;
    defense: number;
}

/**
 * 战斗单位
 */
@ccclass("BattleUnit")
export class BattleUnit extends Component {
    public data!: BattleUnitData;

    public hp: number = 0;

    @property(Label)
    nameLabel!: Label;

    @property(Label)
    hpLabel!: Label;

    protected start(): void {
        this.refreshView();
    }

    public setData(data: BattleUnitData) {
        this.data = data;

        this.hp = data.maxHp;

        this.refreshView();
    }

    public isDead(): boolean {
        return this.hp <= 0;
    }

    public takeDamage(rawDamage: number): number {
        const damage = Math.max(1, rawDamage - this.data.defense);

        this.hp = Math.max(0, this.hp - damage);

        this.refreshView();

        return damage;
    }

    public attackTarget(target: BattleUnit) {
        if (this.isDead() || target.isDead()) {
            return 0;
        }

        return target.takeDamage(this.data.attack);
    }

    private refreshView() {
        const {name, maxHp} = this.data || {};
        const { hp } = this;

        this.nameLabel.string = name || "";
        this.hpLabel.string = `${hp}/${maxHp}`;
    }
}


