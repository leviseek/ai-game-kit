/**
 * 引擎无关的 ViewModel→视图渲染契约：可观察状态、视图节点接缝与绑定声明。
 * 不依赖 cc 或 fgui；节点读写由 Adapter 边界实现，渲染器仅消费本契约。
 */

/** 可观察状态：读取、写入与订阅变化。写入相同值不触发订阅（幂等语义）。 */
export interface Bindable<T> {
    get(): T;
    set(value: T): void;
    /** 订阅变化；返回释放句柄，调用后不再收到后续通知。 */
    subscribe(listener: (value: T) => void): { dispose(): void };
}

/**
 * 视图节点接缝：渲染器经它读写单个呈现元素。实现由 Adapter 边界包装
 * 引擎节点（如 fgui 的 GObject），渲染器自身不接触引擎类型。
 */
export interface ViewModelNode {
    setText(value: string): void;
    setProgress(value: number): void;
    setVisible(value: boolean): void;
    /** 注册点击回调；渲染器在绑定建立时调用一次。 */
    onClick(handler: () => void): void;
    /**
     * 可选坐标写入：把 VM 位置数据映射到节点坐标。向后兼容扩展，节点未实现
     * 时渲染器忽略该操作（spec 的"不支持坐标的节点不中断"）。
     */
    setXY?(x: number, y: number): void;
}

/** 文本绑定：把 VM 字段格式化后写入节点文本。 */
export interface TextBinding<VM> {
    readonly kind: "text";
    readonly node: string;
    readonly get: (vm: VM) => string;
}

/** 进度绑定：把 VM 数值（归一化 0..1）写入节点进度。 */
export interface ProgressBinding<VM> {
    readonly kind: "progress";
    readonly node: string;
    readonly get: (vm: VM) => number;
}

/** 显隐绑定：把 VM 布尔值映射为节点可见性。 */
export interface VisibleBinding<VM> {
    readonly kind: "visible";
    readonly node: string;
    readonly get: (vm: VM) => boolean;
}

/** 坐标绑定：把 VM 的位置数据（屏幕坐标）映射到节点坐标。 */
export interface PositionBinding<VM> {
    readonly kind: "position";
    readonly node: string;
    readonly get: (vm: VM) => { x: number; y: number };
}

/** 命令绑定：节点点击触发 VM 命令回调。 */
export interface CommandBinding<VM> {
    readonly kind: "command";
    readonly node: string;
    readonly run: (vm: VM) => void;
}

/** 绑定声明判别联合：描述 VM 字段到视图节点的映射关系，纯数据。 */
export type Binding<VM> =
    | TextBinding<VM>
    | ProgressBinding<VM>
    | VisibleBinding<VM>
    | PositionBinding<VM>
    | CommandBinding<VM>;
