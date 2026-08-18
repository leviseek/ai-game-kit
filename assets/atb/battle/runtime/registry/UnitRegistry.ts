import { UnitData } from "../../data/units/UnitData";

export class UnitRegistry {
    private readonly data = new Map<string, UnitData>();

    public register(unit: UnitData): void {
        if (this.data.has(unit.id)) {
            throw new Error(`Unit already registered: ${unit.id}`);
        }

        this.data.set(unit.id, unit);
    }

    public get(id: string): UnitData {
        const unit = this.data.get(id);

        if (!unit) {
            throw new Error(`Unit not found: ${id}`);
        }

        return unit;
    }

    public has(id: string): boolean {
        return this.data.has(id);
    }
}
