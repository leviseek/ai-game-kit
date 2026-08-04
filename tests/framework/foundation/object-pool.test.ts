import { describe, expect, spyOn, test } from "bun:test";

import type { DisposeHandle } from "../../../assets/framework/core/scheduling/DisposeHandle";
import {
  createObjectPool,
  type ObjectPool,
} from "../../../assets/framework/core/pooling/ObjectPool";

interface Token {
  readonly id: number;
  dirty: boolean;
}

interface Failure {
  readonly error: Error;
}

function createFailures(): {
  readonly failures: Failure[];
  readonly onPoolError: (error: unknown) => void;
} {
  const failures: Failure[] = [];

  return {
    failures,
    onPoolError: (error) => {
      failures.push({ error: error as Error });
    },
  };
}

function createTokenPool(options: {
  readonly capacity: number;
  readonly factoryCalls?: (count: number) => void;
  readonly reset?: (token: Token) => void;
  readonly onPoolError?: (error: unknown) => void;
}): {
  readonly pool: ObjectPool<Token>;
  readonly factoryCalls: () => number;
} {
  let calls = 0;

  const pool = createObjectPool<Token>({
    capacity: options.capacity,
    factory: () => {
      const token: Token = { id: calls, dirty: false };
      calls += 1;
      options.factoryCalls?.(calls);
      return token;
    },
    reset: options.reset,
    onPoolError: options.onPoolError,
  });

  return {
    pool,
    factoryCalls: () => calls,
  };
}

describe("ObjectPool acquire reuse", () => {
  test("acquire returns an object created by the factory", () => {
    const { pool, factoryCalls } = createTokenPool({ capacity: 2 });

    const token = pool.acquire();

    expect(token).not.toBeUndefined();
    expect(typeof token.id).toBe("number");
    expect(factoryCalls()).toBe(1);
  });

  test("a returned object is reused by the next acquire without a new factory call", () => {
    const { pool, factoryCalls } = createTokenPool({ capacity: 2 });

    const first = pool.acquire();
    pool.release(first);

    const second = pool.acquire();

    expect(second).toBe(first);
    expect(factoryCalls()).toBe(1);
  });

  test("each acquire hands out a distinct instance until objects are returned", () => {
    const { pool } = createTokenPool({ capacity: 3 });

    const a = pool.acquire();
    const b = pool.acquire();

    expect(a).not.toBe(b);
  });
});

describe("ObjectPool capacity", () => {
  test("acquires up to the configured capacity return usable objects without overflow", () => {
    const { failures, onPoolError } = createFailures();
    const { pool, factoryCalls } = createTokenPool({
      capacity: 3,
      onPoolError,
    });

    const tokens = [pool.acquire(), pool.acquire(), pool.acquire()];

    expect(tokens).toHaveLength(3);
    expect(tokens[0]).not.toBe(tokens[1]);
    expect(tokens[1]).not.toBe(tokens[2]);
    expect(factoryCalls()).toBe(3);
    expect(failures).toHaveLength(0);
  });

  test("objects created for capacity are all returned as usable instances", () => {
    const { pool } = createTokenPool({ capacity: 2 });

    const a = pool.acquire();
    const b = pool.acquire();

    expect(typeof a.id).toBe("number");
    expect(typeof b.id).toBe("number");
  });
});

describe("ObjectPool overflow observability", () => {
  test("acquiring beyond capacity creates a temporary object and reports observably", () => {
    const { failures, onPoolError } = createFailures();
    const { pool, factoryCalls } = createTokenPool({
      capacity: 1,
      onPoolError,
    });

    const first = pool.acquire();
    const overflow = pool.acquire();

    expect(first).not.toBe(overflow);
    expect(typeof overflow.id).toBe("number");
    expect(factoryCalls()).toBe(2);
    expect(failures).toHaveLength(1);
    expect(failures[0].error).toBeInstanceOf(Error);
    expect(failures[0].error.message).toMatch(/overflow/i);
  });

  test("after a regular object is returned, acquiring again reuses it without overflow", () => {
    const { failures, onPoolError } = createFailures();
    const { pool, factoryCalls } = createTokenPool({
      capacity: 1,
      onPoolError,
    });

    const a = pool.acquire();
    pool.release(a);

    const b = pool.acquire();

    expect(b).toBe(a);
    expect(factoryCalls()).toBe(1);
    expect(failures).toHaveLength(0);
  });
});

describe("ObjectPool double return", () => {
  test("releasing the same object twice rejects the second release and keeps the pool consistent", () => {
    const { failures, onPoolError } = createFailures();
    const { pool, factoryCalls } = createTokenPool({
      capacity: 2,
      onPoolError,
    });

    const a = pool.acquire();
    pool.release(a);
    pool.release(a);

    expect(failures).toHaveLength(1);
    expect(failures[0].error).toBeInstanceOf(Error);

    const b = pool.acquire();
    const c = pool.acquire();
    expect(b).not.toBe(c);
    expect(factoryCalls()).toBe(2);
  });

  test("an object not lent by this pool is rejected on release", () => {
    const { failures, onPoolError } = createFailures();
    const { pool } = createTokenPool({ capacity: 2, onPoolError });

    const external: Token = { id: 99, dirty: false };
    pool.release(external);

    expect(failures).toHaveLength(1);
    expect(failures[0].error.message).toMatch(/not.*lent|return/i);

    const borrowed = pool.acquire();
    expect(borrowed).not.toBe(external);
  });
});

describe("ObjectPool reset hook", () => {
  test("a returned object is reset before it can be acquired again", () => {
    const resetCalls: number[] = [];
    const { pool } = createTokenPool({
      capacity: 2,
      reset: (token) => {
        token.dirty = false;
        resetCalls.push(token.id);
      },
    });

    const token = pool.acquire();
    token.dirty = true;
    pool.release(token);

    const reused = pool.acquire();

    expect(reused).toBe(token);
    expect(reused.dirty).toBe(false);
    expect(resetCalls).toEqual([token.id]);
  });

  test("reset is not invoked for an object the pool did not lend", () => {
    const resetCalls: number[] = [];
    const { failures, onPoolError } = createFailures();
    const { pool } = createTokenPool({
      capacity: 2,
      reset: (token) => {
        resetCalls.push(token.id);
      },
      onPoolError,
    });

    const external: Token = { id: 99, dirty: false };
    pool.release(external);

    expect(failures).toHaveLength(1);
    expect(resetCalls).toEqual([]);
  });
});

describe("ObjectPool reset failure isolation", () => {
  test("a failing reset drops the object instead of reusing it and reports the error", () => {
    const { failures, onPoolError } = createFailures();
    const { pool, factoryCalls } = createTokenPool({
      capacity: 2,
      onPoolError,
      reset: () => {
        throw new Error("reset failed");
      },
    });

    const a = pool.acquire();
    pool.release(a);

    expect(failures).toHaveLength(1);
    expect(failures[0].error.message).toBe("reset failed");

    const b = pool.acquire();
    expect(b).not.toBe(a);
    expect(factoryCalls()).toBe(2);
  });

  test("one failing reset does not affect other objects in the pool", () => {
    const { failures, onPoolError } = createFailures();
    let resetCalls = 0;
    const { pool } = createTokenPool({
      capacity: 2,
      onPoolError,
      reset: () => {
        resetCalls += 1;
        if (resetCalls === 1) {
          throw new Error("first reset failed");
        }
      },
    });

    const a = pool.acquire();
    const b = pool.acquire();
    pool.release(a);

    expect(failures).toHaveLength(1);

    pool.release(b);
    const c = pool.acquire();

    expect(c).toBe(b);
    expect(resetCalls).toBe(2);
  });
});

describe("ObjectPool dispose", () => {
  test("dispose returns a DisposeHandle", () => {
    const { pool } = createTokenPool({ capacity: 2 });

    const handle: DisposeHandle = pool.dispose();

    expect(typeof handle.dispose).toBe("function");
  });

  test("acquire after dispose throws without creating objects", () => {
    const { pool, factoryCalls } = createTokenPool({ capacity: 2 });

    pool.dispose();

    expect(() => pool.acquire()).toThrow(/disposed/i);
    expect(factoryCalls()).toBe(0);
  });

  test("release after dispose is a safe no-op", () => {
    const { pool } = createTokenPool({ capacity: 2 });

    const token = pool.acquire();
    pool.dispose();

    expect(() => pool.release(token)).not.toThrow();
  });

  test("repeated disposal is idempotent and runs no reset hooks", () => {
    const resetCalls: number[] = [];
    const { pool } = createTokenPool({
      capacity: 2,
      reset: (token) => {
        resetCalls.push(token.id);
      },
    });

    const token = pool.acquire();
    pool.release(token);

    expect(() => {
      pool.dispose();
      pool.dispose();
      pool.dispose();
    }).not.toThrow();

    expect(resetCalls).toEqual([token.id]);
  });
});

describe("ObjectPool lifecycle containment", () => {
  test("the pool does not manage objects it did not explicitly lend", () => {
    const { failures, onPoolError } = createFailures();
    const { pool } = createTokenPool({ capacity: 2, onPoolError });

    const external: Token = { id: 7, dirty: false };
    pool.release(external);
    pool.release(external);

    expect(failures).toHaveLength(2);

    const owned = pool.acquire();
    expect(owned).not.toBe(external);
    expect(owned.id).toBe(0);
  });
});

describe("ObjectPool contract shape", () => {
  test("satisfies the ObjectPool interface shape", () => {
    const { pool } = createTokenPool({ capacity: 2 });
    const typed: ObjectPool<Token> = pool;

    expect(typeof typed.acquire).toBe("function");
    expect(typeof typed.release).toBe("function");
    expect(typeof typed.dispose).toBe("function");
  });
});

describe("ObjectPool error reporter isolation", () => {
  test("a throwing error reporter is contained and does not break the pool", () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    try {
      const { pool } = createTokenPool({
        capacity: 1,
        onPoolError: () => {
          throw new Error("reporter failed");
        },
      });

      pool.acquire();
      expect(() => pool.acquire()).not.toThrow();

      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
