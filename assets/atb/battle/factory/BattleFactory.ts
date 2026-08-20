import { BattleDefinition } from "../data/battles/BattleDefinition";
import { TestBuffs, TestSkills, TestUnits } from "../data/battles/TestBattleData";
import { BattleWorld } from "../runtime/BattleWorld";
import { UnitFactory } from "./UnitFactory";

/**
 *
 */
export class BattleFactory {
    public static create(definition: BattleDefinition): BattleWorld {
        const world = new BattleWorld();

        const unitFactory = new UnitFactory(world);

        this.registerData(world);

        for (const unitId of definition.redTeam) {
            const data = world.unitReg.get(unitId);

            unitFactory.create(data);
        }

        for (const unitId of definition.blueTeam) {
            const data = world.unitReg.get(unitId);

            unitFactory.create(data);
        }

        world.captureInitialState();

        return world;
    }

    private static registerData(world: BattleWorld): void {
        // 暂时由 TestData 提供
        for (const buff of Object.values(TestBuffs)) {
            world.buffReg.register(buff);
        }

        for (const skill of Object.values(TestSkills)) {
            world.skillReg.register(skill);
        }

        for (const unit of Object.values(TestUnits)) {
            world.unitReg.register(unit);
        }
    }
}
