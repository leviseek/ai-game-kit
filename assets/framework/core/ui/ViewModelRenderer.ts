import type {
    Bindable,
    Binding,
    ViewModelNode,
} from "../../contracts/ui/ViewModel";

/**
 * 渲染器选项：视图节点解析器 + 绑定声明。节点解析按名返回节点实现，
 * 节点不存在时返回 undefined（渲染时跳过该绑定，不中断其它绑定）。
 */
export interface ViewModelRendererOptions<VM> {
    readonly node: (name: string) => ViewModelNode | undefined;
    readonly bindings: readonly Binding<VM>[];
}

/** 自动 diff 渲染器：setViewModel 全量渲染，随后每次调用只更新值变化的绑定。 */
export interface ViewModelRenderer<VM> {
    /** 设置并渲染 ViewModel：首次全量，后续按绑定 diff 只更新变化项。 */
    setViewModel(vm: VM): void;
    /** 强制全量渲染全部绑定。 */
    refresh(): void;
    /** 清理订阅与命令回调，幂等；dispose 后不再渲染。 */
    dispose(): void;
}

/**
 * 可观察状态容器：写入相同值不触发订阅（幂等），订阅返回释放句柄。
 * 渲染器用它桥接 VM 变化自动刷新；本工厂为独立可复用状态原语。
 */
export function createBindable<T>(initial: T): Bindable<T> {
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
    // 记录每个绑定上次渲染的 get 结果，diff 依据；未渲染过为 undefined 哨兵
    const lastValues: (unknown | undefined)[] = new Array(options.bindings.length);
    // 命令回调已注册标记：每个命令绑定只注册一次点击回调
    const commandRegistered: boolean[] = new Array(options.bindings.length);
    const views: (ViewModelNode | undefined)[] = new Array(options.bindings.length);
    let vm: VM | undefined;
    let disposed = false;

    function renderAll(): void {
        if (disposed || vm === undefined) {
            return;
        }
        for (let index = 0; index < options.bindings.length; index += 1) {
            const binding = options.bindings[index];
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
    function resolveView(index: number, name: string): ViewModelNode | undefined {
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

    // 按绑定类型写入节点并记录上次值；命令绑定只注册一次点击回调
    function applyBinding<VM_>(index: number, binding: Binding<VM_>, view: ViewModelNode): void {
        if (binding.kind === "command") {
            if (!commandRegistered[index]) {
                commandRegistered[index] = true;
                view.onClick(() => {
                    if (!disposed && vm !== undefined) {
                        binding.run(vm as VM_);
                    }
                });
            }
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
            default:
                break;
        }
    }

    return {
        setViewModel(next: VM): void {
            if (disposed) {
                return;
            }
            vm = next;
            renderAll();
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
