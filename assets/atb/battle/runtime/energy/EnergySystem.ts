import { BattleEventType, EnergyChangedEvent } from "../event/BattleEvent";
import { BattleSystem } from "../system/BattleSystem";

export class EnergySystem extends BattleSystem {
    protected TAG: string = "EnergySystem";
    public update(dt: number): void {
        if (dt <= 0) {
            return;
        }

        const { world } = this;

        for (const unit of world.getAllUnits()) {
            if (unit.isDead()) {
                continue;
            }

            if (unit.energyRegen <= 0) {
                continue;
            }

            const gained = unit.addEnergy(unit.energyRegen * dt);
            if (gained > 0) {
                const changedEvt: EnergyChangedEvent = {
                    type: BattleEventType.EnergyChanged,
                    unitId: unit.id,
                    delta: gained,
                    energy: unit.energy,
                    time: world.getTime(),
                    sequence: 0,
                };
                world.emitEvent(changedEvt);
            }
        }
    }
}
