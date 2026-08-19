import { describe, expect, test } from "bun:test";

import { createListViewPool, type ListViewPool } from "../../../assets/atb/ui/list/ListViewPool";

interface Token {
    readonly id: number;
}

function makePool(options: { capacity?: number; onError?: (error: unknown) => void }): {
    pool: ListViewPool<Token>;
    creates: string[];
    failures: unknown[];
} {
    const creates: string[] = [];
    const failures: unknown[] = [];
    let seq = 0;
    const pool = createListViewPool<Token>({
        capacityPerTemplate: options.capacity ?? 2,
        createNode: (templateId) => {
            creates.push(templateId);
            return { id: seq++ };
        },
        resetNode: () => {},
        onError: options.onError ?? ((error) => failures.push(error)),
    });
    return { pool, creates, failures };
}

describe("ListViewPool", () => {
    test("同一模板：归还后复用，不重复创建", () => {
        const { pool, creates } = makePool({});
        const a = pool.acquire("t");
        pool.release(a);
        const b = pool.acquire("t");
        expect(b).toBe(a);
        expect(creates).toEqual(["t"]);
    });

    test("多模板分池隔离：不同模板不互相复用", () => {
        const { pool, creates } = makePool({});
        const a = pool.acquire("a");
        pool.release(a);
        const b = pool.acquire("b");
        const a2 = pool.acquire("a");
        expect(b).not.toBe(a);
        expect(a2).toBe(a);
        expect(creates).toEqual(["a", "b"]);
    });

    test("条目按自身 templateId 路由归还（跨模板释放不乱串）", () => {
        const { pool } = makePool({});
        const a = pool.acquire("a");
        const b = pool.acquire("b");
        pool.release(a);
        pool.release(b);
        expect(pool.acquire("a")).toBe(a);
        expect(pool.acquire("b")).toBe(b);
    });

    test("容量溢出：创建临时对象并上报，归还后丢弃", () => {
        const { pool, creates, failures } = makePool({ capacity: 1 });
        const a = pool.acquire("t");
        const overflow = pool.acquire("t"); // 容量 1 已满
        expect(failures.length).toBe(1);
        expect(overflow).not.toBe(a);
        pool.release(overflow); // 临时对象直接丢弃
        pool.release(a);
        expect(pool.acquire("t")).toBe(a); // 常规对象可复用
        expect(creates).toEqual(["t", "t"]); // 临时对象归还不回流，第三次为复用
    });

    test("未知/重复归还经 onError 上报", () => {
        const { pool, failures } = makePool({});
        pool.release({ node: { id: 99 }, templateId: "t" });
        expect(failures.length).toBe(1);
        const a = pool.acquire("t");
        pool.release(a);
        pool.release(a); // 重复归还
        expect(failures.length).toBe(2);
    });

    test("dispose 后 acquire 抛错，重复 dispose 幂等", () => {
        const { pool } = makePool({});
        pool.dispose();
        pool.dispose();
        expect(() => pool.acquire("t")).toThrow();
    });
});
