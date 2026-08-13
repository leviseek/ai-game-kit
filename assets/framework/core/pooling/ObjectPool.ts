import type { DisposeHandle } from "../scheduling/DisposeHandle";

export interface ObjectPoolOptions<T> {
    readonly capacity: number;
    readonly factory: () => T;
    readonly reset?: (item: T) => void;
    readonly onPoolError?: (error: unknown) => void;
}

export interface ObjectPool<T> {
    acquire(): T;
    release(item: T): void;
    dispose(): DisposeHandle;
}

const NOOP_HANDLE: DisposeHandle = {
    dispose: () => {},
};

/**
 * 显式所有者对象池（explicit-owner）。只管理通过 `acquire` 显式借出的对象，
 * 释放任意未借出的对象会被拒绝。对象池至多管理 `capacity` 个常规对象；
 * 超出容量的获取会创建临时对象、经错误报告器上报溢出（overflow）以保证结果
 * 可观测，临时对象在归还时被丢弃。
 */
export function createObjectPool<T>(options: ObjectPoolOptions<T>): ObjectPool<T> {
    const { capacity, factory, reset } = options;
    const reportFailure = options.onPoolError ?? ((error: unknown) => console.error(error));

    const free: T[] = [];
    const borrowed = new Map<T, boolean>();
    let managed = 0;
    let disposed = false;

    function report(error: unknown): void {
        try {
            reportFailure(error);
        } catch (reporterError) {
            console.error(reporterError);
        }
    }

    function create(): T {
        try {
            return factory();
        } catch (error) {
            report(error);
            throw error;
        }
    }

    function acquire(): T {
        if (disposed) {
            throw new Error("ObjectPool cannot acquire after it was disposed");
        }

        const idle = free.pop();

        if (idle !== undefined) {
            borrowed.set(idle, false);
            return idle;
        }

        if (managed < capacity) {
            const created = create();
            managed += 1;
            borrowed.set(created, false);
            return created;
        }

        const overflow = create();
        borrowed.set(overflow, true);
        report(new Error(`ObjectPool overflow beyond capacity ${capacity}: created a temporary object`));
        return overflow;
    }

    function release(item: T): void {
        if (disposed) {
            return;
        }

        const isTemporary = borrowed.get(item);

        if (isTemporary === undefined) {
            report(new Error("ObjectPool rejected release of an object it did not lend (unknown or double return)"));
            return;
        }

        borrowed.delete(item);

        try {
            reset?.(item);
        } catch (error) {
            if (!isTemporary) {
                managed -= 1;
            }
            report(error);
            return;
        }

        if (isTemporary) {
            return;
        }

        free.push(item);
    }

    function dispose(): DisposeHandle {
        if (disposed) {
            return NOOP_HANDLE;
        }

        disposed = true;

        return NOOP_HANDLE;
    }

    return {
        acquire,
        release,
        dispose,
    };
}
