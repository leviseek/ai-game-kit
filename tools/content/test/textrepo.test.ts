import { describe, expect, it } from "bun:test";
// 直接测真实生成物（freshness 由 content validate 保证与语言表一致）
import { TextNotFoundError, text, zhCN } from "../../../assets/game-content/generated/i18n";

describe("TextRepo（真实生成物）", () => {
    it("已知 key 返回主语言文案", () => {
        expect(text.get("auto_battle.buffs.attack-up.name")).toBe("攻击强化");
        expect(text.get("auto_battle.heroes.ally-tank.name")).toBe("坦克");
    });

    it("未知 key fail-fast 抛 TextNotFoundError 且带最近相似 key", () => {
        let thrown: unknown;
        try {
            text.get("auto_battle.buffs.attack-up.nam"); // 拼错
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(TextNotFoundError);
        expect((thrown as TextNotFoundError).nearest).toBe("auto_battle.buffs.attack-up.name");
    });

    it("has/getOr 语义", () => {
        expect(text.has("auto_battle.skills.ally-mage-skill.name")).toBe(true);
        expect(text.has("ghost.key")).toBe(false);
        expect(text.getOr("ghost.key", "fallback")).toBe("fallback");
    });

    it("主语言表含全部 key 且非空", () => {
        expect(Object.keys(zhCN).length).toBeGreaterThanOrEqual(15);
        for (const value of Object.values(zhCN)) {
            expect(value.length).toBeGreaterThan(0);
        }
    });
});
