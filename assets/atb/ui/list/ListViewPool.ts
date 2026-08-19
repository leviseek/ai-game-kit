import { createObjectPool, type ObjectPool } from "../../../framework";

/** 池内条目：节点 + 所属模板 id（归还时按模板路由回对应子池）。 */
export interface ListViewPoolRecord<TNode> {
    readonly node: TNode;
    readonly templateId: string;
}

export interface ListViewPool<TNode> {
    /** 按模板 id 借出节点；对应子池为空时经工厂创建。 */
    acquire(templateId: string): ListViewPoolRecord<TNode>;
    /** 归还节点（按条目携带的模板 id 路由）；重复/未知归还经 onError 上报。 */
    release(record: ListViewPoolRecord<TNode>): void;
    /** 释放全部子池；幂等。 */
    dispose(): void;
}

export interface ListViewPoolOptions<TNode> {
    /** 每个模板子池的容量；超出容量的获取创建临时对象并经 onError 上报。 */
    readonly capacityPerTemplate: number;
    /** 节点工厂：按模板 id 创建新节点（子池首次借出时调用）。 */
    readonly createNode: (templateId: string) => TNode;
    /** 节点复位钩子：归还时调用（如隐藏节点、复位状态）。 */
    readonly resetNode?: (node: TNode) => void;
    /** 池错误上报；缺省 console.error。 */
    readonly onError?: (error: unknown) => void;
}

/**
 * ListView 节点复用池：按模板 id 分池，底层复用 framework 显式所有者对象池
 * （explicit-owner），借出/归还/溢出上报语义与之一致。纯 TS，无引擎依赖。
 */
export function createListViewPool<TNode>(options: ListViewPoolOptions<TNode>): ListViewPool<TNode> {
    const pools = new Map<string, ObjectPool<ListViewPoolRecord<TNode>>>();
    let disposed = false;

    function poolOf(templateId: string): ObjectPool<ListViewPoolRecord<TNode>> {
        if (disposed) {
            throw new Error("ListViewPool cannot be used after dispose");
        }
        let pool = pools.get(templateId);
        if (pool === undefined) {
            pool = createObjectPool<ListViewPoolRecord<TNode>>({
                capacity: options.capacityPerTemplate,
                factory: () => ({ node: options.createNode(templateId), templateId }),
                reset: (record) => options.resetNode?.(record.node),
                onPoolError: options.onError,
            });
            pools.set(templateId, pool);
        }
        return pool;
    }

    return {
        acquire(templateId) {
            return poolOf(templateId).acquire();
        },
        release(record) {
            if (disposed) {
                return;
            }
            poolOf(record.templateId).release(record);
        },
        dispose() {
            if (disposed) {
                return;
            }
            disposed = true;
            for (const pool of pools.values()) {
                pool.dispose();
            }
            pools.clear();
        },
    };
}
