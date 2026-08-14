import type { IBindable } from "../../contracts/interfaces/IBindable";
import type { Binding } from "../../contracts/interfaces/Binding";
import type { IPositionBinding } from "../../contracts/interfaces/IPositionBinding";
import type { IViewModelNode } from "../../contracts/interfaces/IViewModelNode";

/**
 * 渲染器选项：视图节点解析器 + 绑定声明。节点解析按名返回节点实现，
 * 节点不存在时返回 undefined（渲染时跳过该绑定，不中断其它绑定）。
 */
export interface ViewModelRendererOptions<VM> {
    readonly node: (name: string) => IViewModelNode | undefined;
    readonly bindings: readonly Binding<VM>[];
}

/** 自动 diff 渲染器：setViewModel 全量渲染，随后每次调用只更新值变化的绑定。 */
export interface ViewModelRenderer<VM> {
    /** 设置并渲染 ViewModel：首次全量，后续按绑定 diff 只更新变化项。 */
    setViewModel(vm: VM): void;
    /**
     * 重置绑定集：以新绑定数组重建 diff 状态并全量渲染。供动态绑定集使用
     * （绑定数量/节点名随运行时可变的实体集合增删，如单位实例）。
     */
    setBindings(bindings: readonly Binding<VM>[]): void;
    /** 强制全量渲染全部绑定。 */
    refresh(): void;
    /** 清理订阅与命令回调，幂等；dispose 后不再渲染。 */
    dispose(): void;
}

/**
 * 节点解析器可选回收钩子：渲染器在 setBindings 全量刷新后，把当前绑定集的
 * 全部节点名交给解析器。供动态实例句柄（如 DynamicComponentViewHandle）回收
 * 不再被绑定的实例——按节点名推导活跃实例 id，销毁其余。纯函数解析器不实现
 * 该可选属性时渲染器跳过，行为不变。
 */
export interface ViewModelNodeResolverPrune {
    prune(nodeNames: readonly string[]): void;
}

/**
 * 可观察状态容器：写入相同值不触发订阅（幂等），订阅返回释放句柄。
 * 渲染器用它桥接 VM 变化自动刷新；本工厂为独立可复用状态原语。
 */
export function createBindable<T>(initial: T): IBindable<T> {
    let current = initial;
    const listeners = new Set<(value: T) => void>();

    return {
        get: () => current,
        set: (value: T) => {
            if (Object.is(current, value)) {
                return;
            }
            current = value;
            for (const listener of Array.from(listeners)) {
                listener(current);
            }
        },
        subscribe: (listener: (value: T) => void) => {
            listeners.add(listener);
            return {
                dispose: () => {
                    listeners.delete(listener);
                },
            };
        },
    };
}

/**
 * 引擎无关的自动 diff 渲染器：把 ViewModel 绑定到视图节点。
 * 每次 setViewModel 以绑定为单位 diff：get 结果与上次一致则不更新节点，
 * 只更新变化的绑定，避免对同一节点重复写入。命令绑定在首次渲染时经
 * 节点 onClick 注册（点击回调闭包持有最新 VM 引用）。dispose 后 no-op。
 */
export function createViewModelRenderer<VM>(
    options: ViewModelRendererOptions<VM>,
): ViewModelRenderer<VM> {
    // 绑定集可变：setBindings 重建后 diff 状态随之重建（供动态实体集合使用）
    let bindings: readonly Binding<VM>[] = options.bindings;
    // 记录每个绑定上次渲染的 get 结果，diff 依据；未渲染过为 undefined 哨兵
    let lastValues: (unknown | undefined)[] = new Array(bindings.length);
    // 已注册命令的节点名集合：跨 setBindings 保留——避免动态重建绑定集时对同一
    // 节点重复注册 onClick（Adapter 的 onClick 通常是追加监听，重复注册会累积）
    const registeredCommandNodes = new Set<string>();
    const enabledNodes = new Map<string, boolean>();
    let views: (IViewModelNode | undefined)[] = new Array(bindings.length);
    let vm: VM | undefined;
    let disposed = false;

    function renderAll(): void {
        if (disposed || vm === undefined) {
            return;
        }
        for (let index = 0; index < bindings.length; index += 1) {
            const binding = bindings[index];
            if (binding === undefined) {
                continue;
            }
            const view = resolveView(index, binding.node);
            if (view === undefined) {
                // 节点不存在：跳过该绑定，不中断其它绑定（未知节点容错契约）
                continue;
            }
            applyBinding(index, binding, view);
        }
    }

    // 惰性解析视图节点并缓存，避免每次渲染重复查找；节点不存在返回 undefined
    function resolveView(index: number, name: string): IViewModelNode | undefined {
        const cached = views[index];
        if (cached !== undefined) {
            return cached;
        }
        const resolved = options.node(name);
        if (resolved === undefined) {
            return undefined;
        }
        views[index] = resolved;
        return resolved;
    }

    // 按绑定类型写入节点并记录上次值；命令绑定只注册一次点击回调（按节点名去重）
    function applyBinding<VM_>(index: number, binding: Binding<VM_>, view: IViewModelNode): void {
        if (binding.kind === "command") {
            if (!registeredCommandNodes.has(binding.node)) {
                registeredCommandNodes.add(binding.node);
                view.onClick(() => {
                    if (!disposed && vm !== undefined && enabledNodes.get(binding.node) !== false) {
                        binding.run(vm as VM_);
                    }
                });
            }
            return;
        }

        if (binding.kind === "position") {
            applyPositionBinding(index, binding, view);
            return;
        }

        const next = binding.get(vm as VM_);
        const last = lastValues[index];
        // diff：值未变化（Object.is 相等）则不重复写入节点
        if (last !== undefined && Object.is(last, next)) {
            return;
        }
        lastValues[index] = next;

        switch (binding.kind) {
            case "text":
                view.setText(next as string);
                break;
            case "progress":
                view.setProgress(next as number);
                break;
            case "visible":
                view.setVisible(next as boolean);
                break;
            case "enabled":
                enabledNodes.set(binding.node, next as boolean);
                view.setEnabled?.(next as boolean);
                break;
            default:
                // exhaustiveness 兜底：新增绑定 kind 未在此分发时，binding 收窄
                // 不为 never，传给 assertNever 触发编译期报错
                assertNever(binding);
                break;
        }
    }

    // 坐标绑定：get 返回对象字面量，每次新引用使 Object.is 恒 false，须按 x/y
    // 分量与上次值做结构比较，坐标未变不重复写入；节点未实现 setXY 时忽略不中断
    function applyPositionBinding<VM_>(
        index: number,
        binding: IPositionBinding<VM_>,
        view: IViewModelNode,
    ): void {
        const next = binding.get(vm as VM_);
        const last = lastValues[index] as { x: number; y: number } | undefined;
        if (last !== undefined && last.x === next.x && last.y === next.y) {
            return;
        }
        lastValues[index] = next;
        view.setXY?.(next.x, next.y);
    }

    return {
        setViewModel(next: VM): void {
            if (disposed) {
                return;
            }
            vm = next;
            renderAll();
        },
        setBindings(next: readonly Binding<VM>[]): void {
            if (disposed) {
                return;
            }
            // 绑定集变化：重建 diff 状态（全量）；已注册命令节点名集合保留，
            // 同一节点的命令回调不重复注册
            bindings = next;
            lastValues = new Array(next.length);
            views = new Array(next.length);
            renderAll();
            // 动态实例句柄回收：绑定集已全量渲染，把当前节点名交给解析器，
            // 供其销毁不再活跃的实例（无 prune 能力的解析器跳过）
            const prune = (options.node as
                | { prune?: (names: readonly string[]) => void }
                | undefined)?.prune;
            if (prune !== undefined) {
                prune(next.map((binding) => binding.node));
            }
        },
        refresh(): void {
            if (disposed) {
                return;
            }
            // 全量刷新：清空上次值使全部绑定按当前 VM 重写
            for (let index = 0; index < lastValues.length; index += 1) {
                lastValues[index] = undefined;
            }
            renderAll();
        },
        dispose(): void {
            if (disposed) {
                return;
            }
            disposed = true;
            vm = undefined;
            views.fill(undefined);
        },
    };
}

/**
 * 穷尽性兜底：applyBinding 的 switch 应覆盖全部绑定 kind；新增 kind 未分发时
 * binding 收窄不为 never，此处赋给 never 参数触发编译期报错。
 */
function assertNever(binding: never): void {
    void binding;
}
