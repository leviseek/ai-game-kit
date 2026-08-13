import { describe, expect, test } from "bun:test";

import { BATTLEFIELD_COLS, FORMATION_GRID_COLS, FORMATION_GRID_ROWS, FORMATION_GRID_SIZE, createMapGrid } from "../../../assets/samples/game_auto_battle/logic/grid";

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
        expect(FORMATION_GRID_ROWS * FORMATION_GRID_COLS).toBe(FORMATION_GRID_SIZE);
        // 战场网格 = 两侧各 3 列
        expect(BATTLEFIELD_COLS).toBe(FORMATION_GRID_COLS * 2);
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
