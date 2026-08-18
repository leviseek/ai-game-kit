import { BuffData } from "../../data/buffs/BuffData";

export class BuffRegistry {
    private readonly data: Map<string, BuffData> = new Map();

    public register(buff: BuffData): void {
        if (this.data.has(buff.id)) {
            throw new Error(`Buff already registered: ${buff.id}`);
        }

        this.data.set(buff.id, buff);
    }

    public get(id: string): BuffData {
        const buff = this.data.get(id);

        if (!buff) {
            throw new Error(`Buff not found: ${id}`);
        }

        return buff;
    }

    public has(id: string): boolean {
        return this.data.has(id);
    }
}
