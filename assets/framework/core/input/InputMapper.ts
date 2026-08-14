import type { IInputContextId } from "../../contracts/interfaces/IInputContextId";
import type { IInputEvent } from "../../contracts/interfaces/IInputEvent";
import type { IInputMapping } from "../../contracts/interfaces/IInputMapping";
import type { IInputSample } from "../../contracts/interfaces/IInputSample";
import type { IInputSource } from "../../contracts/interfaces/IInputSource";
import type { ITimeSource } from "../../contracts/interfaces/ITimeSource";

export interface InputMapperOptions<TAction> {
    /**
     * 采样时间戳来源。内核直接取 now()，不保证单调；
     * 时间戳单调性由注入的 ITimeSource 保证，建议注入 MonotonicClock。
     */
    readonly timeSource: ITimeSource;
    /** 初始激活上下文。 */
    readonly activeContext: IInputContextId;
    /** 各输入上下文下的映射声明。键为普通字符串（branded 上下文无法作 Record 键，语义等价）。 */
    readonly mappings: Readonly<Record<string, IInputMapping<TAction>>>;
    /** 初始底层输入源。 */
    readonly source: IInputSource;
    /** 每次产生 action 采样时回调。 */
    readonly onSample: (sample: IInputSample<TAction>) => void;
    /**
     * 阻断来源：提供导航器时默认以其模态状态（modal）作为阻断判定，
     * 模态生效时当前输入不派发 action，用于 UI/玩法分流。
     */
    readonly navigator?: { readonly modal: boolean };
    /** 显式阻断判定回调；提供时优先于 navigator。 */
    readonly isBlocked?: () => boolean;
}

export interface InputMapper<TAction> {
    readonly activeContext: IInputContextId;
    /** 替换全部上下文映射声明，立即生效。 */
    setMappings(mappings: Readonly<Record<string, IInputMapping<TAction>>>): void;
    /** 切换激活上下文，立即生效；不缓冲旧上下文输入。 */
    setActiveContext(context: IInputContextId): void;
    /** 运行时替换底层输入源：退订旧源并订阅新源，映射与上下文保持不变。已释放后 no-op。 */
    replaceSource(source: IInputSource): void;
    /** 退订当前输入源并停止派发，幂等；后续 setMappings/setActiveContext/replaceSource 均为 no-op。 */
    dispose(): void;
}

/**
 * 引擎无关的输入内核：调用方声明"输入上下文 → 输入源 → action"映射表，
 * 当前激活上下文决定哪些映射生效；输入源事件到达时在激活上下文下查表，
 * 命中且未被阻断则产出一条携带状态/值/时间戳的采样。不依赖 cc/fgui。
 */
export function createInputMapper<TAction>(options: InputMapperOptions<TAction>): InputMapper<TAction> {
    const { timeSource, source: initialSource, onSample } = options;
    const isBlocked = options.isBlocked ?? (options.navigator === undefined ? () => false : () => options.navigator?.modal === true);

    // branded 键无运行期值：内部统一用实际字符串（上下文/来源 id）查表
    let activeContext = String(options.activeContext);
    let mappings = options.mappings;
    let currentUnsubscribe: (() => void) | undefined;
    let disposed = false;

    // dispose 后全部变更入口 no-op，避免重新订阅造成无法解除的引用泄漏
    function processEvent(event: IInputEvent): void {
        if (disposed || isBlocked()) {
            return;
        }
        const action = mappings[activeContext]?.[String(event.sourceId)];
        if (action === undefined) {
            return;
        }
        onSample({
            action,
            pressed: event.pressed,
            // 数字输入未携带连续值时，按下=1、释放=0
            value: event.value ?? (event.pressed ? 1 : 0),
            timestamp: timeSource.now(),
        });
    }

    function detachSource(): void {
        currentUnsubscribe?.();
        currentUnsubscribe = undefined;
    }

    function attachSource(source: IInputSource): void {
        detachSource();
        // 先订阅成功再挂载新源：subscribe 抛错时旧源已退订、新源未订阅，
        // 不更新 currentUnsubscribe，避免"有源但无订阅"的不一致状态
        const unsubscribe = source.subscribe(processEvent);
        currentUnsubscribe = unsubscribe;
    }

    attachSource(initialSource);

    return {
        get activeContext(): IInputContextId {
            return activeContext as unknown as IInputContextId;
        },
        // 已释放后全部变更入口 no-op，避免重新订阅造成无法解除的引用泄漏
        setMappings(nextMappings) {
            if (disposed) {
                return;
            }
            mappings = nextMappings;
        },
        setActiveContext(context) {
            if (disposed) {
                return;
            }
            activeContext = String(context);
        },
        replaceSource(source) {
            if (disposed) {
                return;
            }
            attachSource(source);
        },
        dispose() {
            if (disposed) {
                return;
            }
            disposed = true;
            detachSource();
        },
    };
}
