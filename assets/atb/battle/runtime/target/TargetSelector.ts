import { BattleUnit } from "../BattleUnit";
import { BattleWorld } from "../BattleWorld";
import { TargetQuery, TargetRelation, TargetType } from "./TargetQuery";

export class TargetSelector {
    constructor(private readonly world: BattleWorld) {}

    public select(caster: BattleUnit, query: TargetQuery): BattleUnit[] {
        let candidates = this.collectCandidates(caster, query);
        candidates = this.sortCandidates(candidates, query);
        return this.limit(candidates, query);
    }

    private collectCandidates(caster: BattleUnit, query: TargetQuery): BattleUnit[] {
        return this.world.getAllUnits().filter((unit) => {
            if (!query.includeDead && unit.isDead()) {
                return false;
            }

            switch (query.relation) {
                case TargetRelation.Self:
                    return unit === caster;
                case TargetRelation.Ally:
                    return unit.team === caster.team && unit !== caster;
                case TargetRelation.Enemy:
                    return unit.team !== caster.team;
                default:
                    return false;
            }
        });
    }

    private sortCandidates(candidates: BattleUnit[], query: TargetQuery): BattleUnit[] {
        switch (query.type) {
            case TargetType.LowestHp:
                candidates.sort((a, b) => a.hp - b.hp);
                break;
            case TargetType.HighestHp:
                candidates.sort((a, b) => b.hp - a.hp);
                break;
            case TargetType.Single:
            case TargetType.All:
            default:
                break;
        }

        return candidates;
    }

    private limit(candidates: BattleUnit[], query: TargetQuery) {
        if (query.type === TargetType.All) {
            return candidates;
        }

        const maxCount = query.maxCount ?? 1;
        return candidates.slice(0, maxCount);
    }
}
