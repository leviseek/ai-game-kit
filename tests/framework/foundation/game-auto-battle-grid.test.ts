import { describe, expect, test } from "bun:test";

import { BATTLEFIELD_COLS, FORMATION_GRID_COLS, FORMATION_GRID_ROWS, FORMATION_GRID_SIZE, createMapGrid, formationSlotOf } from "../../../assets/samples/game_auto_battle/logic/grid";

describe("Auto-battle MapGrid formation cells", () => {
    test("each side gets FORMATION_GRID_SIZE distinct cells", () => {
        const grid = createMapGrid();
        const ally = grid.formationCells("ally");
        const enemy = grid.formationCells("enemy");

        expect(ally.length).toBe(FORMATION_GRID_SIZE);
        expect(enemy.length).toBe(FORMATION_GRID_SIZE);
        // 敌我布阵区互不重叠
        const overlap = ally.filter((cell) => enemy.includes(cell));
        expect(overlap).toEqual([]);
    });

    test("enemy formation is left of ally formation", () => {
        const grid = createMapGrid();
        const col = (cell: string): number => Number(cell.split(":")[1]);
        const enemyMaxCol = Math.max(...grid.formationCells("enemy").map(col));
        const allyMinCol = Math.min(...grid.formationCells("ally").map(col));

        expect(enemyMaxCol).toBeLessThan(allyMinCol);
    });

    test("formation capacity exceeds the team size upper bound", () => {
        expect(FORMATION_GRID_SIZE).toBeGreaterThan(6);
        // 4-3-4 布阵（前排 4 格、中排 3 格、后排 4 格）：容量 = 4+3+4 = 11，
        // 中排缺顶格故非矩形（行数 × 列数 ≠ 容量）
        expect(FORMATION_GRID_SIZE).toBe(11);
        // 战场网格 11 列（列高 3-4-3-4-…-3 交替，共 38 格）
        expect(BATTLEFIELD_COLS).toBe(11);
        expect(FORMATION_GRID_ROWS).toBe(4);
        expect(FORMATION_GRID_COLS).toBe(3);
    });

    test("formation cells form the 4-3-4 columns with a middle gap", () => {
        const grid = createMapGrid();
        const cellsByCol = (cells: readonly string[]): Map<number, number> => {
            const map = new Map<number, number>();
            for (const cell of cells) {
                const col = Number(cell.split(":")[1]);
                map.set(col, (map.get(col) ?? 0) + 1);
            }
            return map;
        };

        // 敌方 4-3-4：列 1(4格)/2(3格)/3(4格)，前排贴中线（列 3）
        const enemyByCol = [...cellsByCol(grid.formationCells("enemy")).entries()].sort((a, b) => a[0] - b[0]);
        expect(enemyByCol).toEqual([
            [1, 4],
            [2, 3],
            [3, 4],
        ]);
        // 己方 4-3-4：列 7(4格)/8(3格)/9(4格)，前排贴中线（列 7）
        const allyByCol = [...cellsByCol(grid.formationCells("ally")).entries()].sort((a, b) => a[0] - b[0]);
        expect(allyByCol).toEqual([
            [7, 4],
            [8, 3],
            [9, 4],
        ]);

        // 中排缺顶格：敌方列 2 / 己方列 8 无行 0；前排/后排占满 4 行
        const enemy = grid.formationCells("enemy");
        const ally = grid.formationCells("ally");
        expect(enemy).not.toContain("0:2");
        expect(ally).not.toContain("0:8");
        expect(enemy).toContain("0:3");
        expect(enemy).toContain("3:3");
        expect(enemy).toContain("0:1");
        expect(enemy).toContain("3:1");
        expect(ally).toContain("0:7");
        expect(ally).toContain("3:7");
        expect(ally).toContain("0:9");
        expect(ally).toContain("3:9");
    });

    test("formationSlotOf resolves the 4-3-4 relative grid to slot order", () => {
        // 槽位序 = 列优先：前排 0-3 → 中排 4-6 → 后排 7-10（每排自上而下）
        expect(formationSlotOf(0, 0)).toBe(0);
        expect(formationSlotOf(3, 0)).toBe(3);
        expect(formationSlotOf(1, 1)).toBe(4);
        expect(formationSlotOf(3, 1)).toBe(6);
        expect(formationSlotOf(0, 2)).toBe(7);
        expect(formationSlotOf(3, 2)).toBe(10);
        // 中排顶格不存在；越界返回 undefined
        expect(formationSlotOf(0, 1)).toBeUndefined();
        expect(formationSlotOf(4, 0)).toBeUndefined();
        expect(formationSlotOf(0, 3)).toBeUndefined();
        expect(formationSlotOf(-1, 0)).toBeUndefined();
    });
});

describe("Auto-battle MapGrid occupancy", () => {
    test("place occupies a free cell and maps back to the unit", () => {
        const grid = createMapGrid();
        const cell = grid.formationCells("ally")[0]!;

        expect(grid.place("u1", cell)).toBe(true);
        expect(grid.occupiedBy(cell)).toBe("u1");
        expect(grid.gridOf("u1")).toBe(cell);
        expect(grid.isFree(cell)).toBe(false);
    });

    test("placing onto an occupied cell is rejected", () => {
        const grid = createMapGrid();
        const cell = grid.formationCells("ally")[0]!;
        grid.place("u1", cell);

        expect(grid.place("u2", cell)).toBe(false);
        expect(grid.occupiedBy(cell)).toBe("u1");
    });

    test("a unit already placed elsewhere cannot be placed again", () => {
        const grid = createMapGrid();
        const cells = grid.formationCells("ally");
        grid.place("u1", cells[0]!);

        expect(grid.place("u1", cells[1]!)).toBe(false);
        expect(grid.gridOf("u1")).toBe(cells[0]);
    });

    test("an out-of-bounds or malformed grid key is rejected", () => {
        const grid = createMapGrid();
        const cell = grid.formationCells("ally")[0]!;
        grid.place("u1", cell);

        expect(grid.place("u2", "999:999")).toBe(false);
        expect(grid.place("u2", "abc")).toBe(false);
        expect(grid.place("u2", "-1:0")).toBe(false);
        expect(grid.place("u2", `${grid.rows}:0`)).toBe(false);
        expect(grid.occupiedBy(cell)).toBe("u1");
    });

    test("non-slot cells are not walkable and reject placement", () => {
        const grid = createMapGrid();
        // 列高 3-4-3-4-…-3：偶数列缺顶行（无槽位），顶行只有奇数列有槽位
        expect(grid.isFree("0:0")).toBe(false);
        expect(grid.isFree("0:2")).toBe(false);
        expect(grid.isFree("0:10")).toBe(false);
        expect(grid.place("u1", "0:0")).toBe(false);
        expect(grid.place("u2", "0:4")).toBe(false);
        // 奇数列顶行与偶数列第 2 行有槽位：可走
        expect(grid.isFree("0:1")).toBe(true);
        expect(grid.isFree("0:9")).toBe(true);
        expect(grid.isFree("1:2")).toBe(true);
        expect(grid.isFree("3:10")).toBe(true);
    });

    test("a cell can be re-occupied after release", () => {
        const grid = createMapGrid();
        const cell = grid.formationCells("ally")[0]!;
        grid.place("u1", cell);
        grid.release("u1");

        expect(grid.place("u2", cell)).toBe(true);
        expect(grid.occupiedBy(cell)).toBe("u2");
    });

    test("release frees the cell and clears the unit", () => {
        const grid = createMapGrid();
        const cell = grid.formationCells("ally")[0]!;
        grid.place("u1", cell);

        expect(grid.release("u1")).toBe(true);
        expect(grid.isFree(cell)).toBe(true);
        expect(grid.gridOf("u1")).toBeUndefined();
    });

    test("releasing an unknown unit is a no-op", () => {
        const grid = createMapGrid();
        expect(grid.release("ghost")).toBe(false);
    });
});
