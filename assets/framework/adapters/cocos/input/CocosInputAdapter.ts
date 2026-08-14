import * as cc from "cc";
import type { IInputEvent } from "../../../contracts/interfaces/IInputEvent";
import type { IInputSource } from "../../../contracts/interfaces/IInputSource";
import type { IInputSourceId } from "../../../contracts/interfaces/IInputSourceId";

// branded 字符串无运行期值：适配器内部按模板字面量构造后在边界收窄为品牌类型
function toSourceId(value: string): IInputSourceId {
    return value as unknown as IInputSourceId;
}

// 结构化的引擎接缝：只依赖本适配器用到的能力，便于测试注入 mock
export interface CocosInputEventTypes {
    readonly touchStart: string;
    readonly touchEnd: string;
    readonly touchCancel: string;
    readonly mouseDown: string;
    readonly mouseUp: string;
    readonly keyDown: string;
    readonly keyUp: string;
    readonly gamepadChange: string;
    readonly gamepadInput: string;
}

export interface CocosInputLike {
    on(eventType: string, callback: (event: unknown) => void, target: unknown): void;
    off(eventType: string, callback: (event: unknown) => void, target: unknown): void;
}

export interface CocosInputAdapterOptions {
    /** 引擎 input；缺省使用 cc.input，测试可注入 mock。 */
    readonly input?: CocosInputLike;
    /** 事件类型字符串集合；缺省使用 cc.Input.EventType，测试可注入 mock。 */
    readonly eventTypes?: CocosInputEventTypes;
}

// 手柄控件接缝：真实 GamepadInputDevice 的按钮/摇杆 getter，测试可注入 mock
interface CocosGamepadButtonLike {
    getValue(): number;
}

interface CocosGamepadDpadLike {
    readonly up?: CocosGamepadButtonLike;
    readonly down?: CocosGamepadButtonLike;
    readonly left?: CocosGamepadButtonLike;
    readonly right?: CocosGamepadButtonLike;
}

interface CocosGamepadStickLike {
    readonly xAxis?: CocosGamepadButtonLike;
    readonly yAxis?: CocosGamepadButtonLike;
}

export interface CocosGamepadLike {
    readonly connected: boolean;
    readonly deviceId: number;
    readonly buttonNorth?: CocosGamepadButtonLike;
    readonly buttonSouth?: CocosGamepadButtonLike;
    readonly buttonEast?: CocosGamepadButtonLike;
    readonly buttonWest?: CocosGamepadButtonLike;
    readonly buttonL1?: CocosGamepadButtonLike;
    readonly buttonL2?: CocosGamepadButtonLike;
    readonly buttonR1?: CocosGamepadButtonLike;
    readonly buttonR2?: CocosGamepadButtonLike;
    readonly buttonStart?: CocosGamepadButtonLike;
    readonly buttonOptions?: CocosGamepadButtonLike;
    readonly dpad?: CocosGamepadDpadLike;
    readonly leftStick?: CocosGamepadStickLike;
    readonly rightStick?: CocosGamepadStickLike;
}

// 手柄控件读取表：sourceId 尾段名称 -> 从接缝取出的控件；缺失控件跳过
const GAMEPAD_BUTTONS: ReadonlyArray<readonly [string, (gamepad: CocosGamepadLike) => CocosGamepadButtonLike | undefined]> = [
    ["south", (g) => g.buttonSouth],
    ["north", (g) => g.buttonNorth],
    ["east", (g) => g.buttonEast],
    ["west", (g) => g.buttonWest],
    ["l1", (g) => g.buttonL1],
    ["l2", (g) => g.buttonL2],
    ["r1", (g) => g.buttonR1],
    ["r2", (g) => g.buttonR2],
    ["start", (g) => g.buttonStart],
    ["options", (g) => g.buttonOptions],
    ["dpadUp", (g) => g.dpad?.up],
    ["dpadDown", (g) => g.dpad?.down],
    ["dpadLeft", (g) => g.dpad?.left],
    ["dpadRight", (g) => g.dpad?.right],
];

const GAMEPAD_AXES: ReadonlyArray<readonly [string, (gamepad: CocosGamepadLike) => CocosGamepadButtonLike | undefined]> = [
    ["leftStickX", (g) => g.leftStick?.xAxis],
    ["leftStickY", (g) => g.leftStick?.yAxis],
    ["rightStickX", (g) => g.rightStick?.xAxis],
    ["rightStickY", (g) => g.rightStick?.yAxis],
];

// 摇杆轴零漂阈值：低于该值视为中立（不派发按下），避免静止抖动产生采样
const AXIS_DEADZONE = 0.05;

function defaultEventTypes(): CocosInputEventTypes {
    const eventType = cc.Input.EventType;
    return {
        touchStart: eventType.TOUCH_START,
        touchEnd: eventType.TOUCH_END,
        touchCancel: eventType.TOUCH_CANCEL,
        mouseDown: eventType.MOUSE_DOWN,
        mouseUp: eventType.MOUSE_UP,
        keyDown: eventType.KEY_DOWN,
        keyUp: eventType.KEY_UP,
        gamepadChange: eventType.GAMEPAD_CHANGE,
        gamepadInput: eventType.GAMEPAD_INPUT,
    };
}

export interface CocosInputAdapter extends IInputSource {
    readonly id: IInputSourceId;
}

/**
 * Cocos 输入适配器：把 cc.input 的触摸/鼠标/键盘/可用手柄事件翻译为内核
 * 可接收的 IInputEvent。sourceId 约定：`touch:<touchId>`、`mouse:<button>`、
 * `key:<keyCode>`、`gamepad:<deviceId>:<控件名>`（控件名见 GAMEPAD_BUTTONS/AXES）。
 * 引擎 API 走可注入接缝；手柄缺失或未连接时降级为无输入而非报错。
 */
export function createCocosInputAdapter(options: CocosInputAdapterOptions = {}): CocosInputAdapter {
    const input = options.input ?? (cc.input as unknown as CocosInputLike);

    // 多订阅者：Set 去重，全部订阅者收到同一事件流；引擎监听在首个订阅者
    // 加入时绑定、最后一个退订时解绑（引用计数），避免单消费者假设限制
    // 未来多消费方（如 GM 面板）并存
    const listeners = new Set<(event: IInputEvent) => void>();
    // 注册用的 handler 引用：首次订阅时解析并缓存，退订复用同一引用，
    // 引擎按 callback 引用匹配退订，每次新建会导致 off 失效
    let resolvedHandlers: ReadonlyArray<readonly [string, (event: unknown) => void]> | undefined;
    // 手柄控件上次派发的状态：仅在状态变化时派发，避免轮询帧重复产生采样
    const lastState = new Map<string, { pressed: boolean; value: number }>();
    // 统一的订阅目标：引擎 on/off 需传同一 target 才能正确退订
    const target = {};

    // 事件类型与 handler 首次订阅时惰性解析：未注入时才读取 cc.Input.EventType，
    // 避免在测试/未初始化环境下构造即访问引擎枚举
    function handlers(): ReadonlyArray<readonly [string, (event: unknown) => void]> {
        if (resolvedHandlers === undefined) {
            const types = options.eventTypes ?? defaultEventTypes();
            resolvedHandlers = [
                [types.touchStart, (event) => handleTouch(event, true)],
                [types.touchEnd, (event) => handleTouch(event, false)],
                [types.touchCancel, (event) => handleTouch(event, false)],
                [types.mouseDown, (event) => handleMouse(event, true)],
                [types.mouseUp, (event) => handleMouse(event, false)],
                [types.keyDown, (event) => handleKey(event, true)],
                [types.keyUp, (event) => handleKey(event, false)],
                [types.gamepadChange, handleGamepadChange],
                [types.gamepadInput, handleGamepadInput],
            ];
        }
        return resolvedHandlers;
    }

    function emit(event: IInputEvent): void {
        // 快照遍历：订阅者退订发生在 emit 期间不破坏本次迭代
        for (const listener of Array.from(listeners)) {
            listener(event);
        }
    }

    /** 绑定引擎监听（首个订阅者）：注册全部事件 handler。 */
    function bindEngine(): void {
        for (const [eventType, handler] of handlers()) {
            input.on(eventType, handler, target);
        }
    }

    /** 解绑引擎监听（最后一个退订）：按引用移除全部 handler 并清空设备状态。 */
    function unbindEngine(): void {
        for (const [eventType, handler] of handlers()) {
            input.off(eventType, handler, target);
        }
        lastState.clear();
    }

    function handleTouch(event: unknown, pressed: boolean): void {
        const touchId = (event as { touch?: { getID(): number } | null }).touch?.getID();
        if (touchId === undefined || touchId === null) {
            return;
        }
        emit({ sourceId: toSourceId(`touch:${touchId}`), pressed });
    }

    function handleMouse(event: unknown, pressed: boolean): void {
        const button = (event as { getButton?: () => number }).getButton?.();
        if (button === undefined) {
            return;
        }
        emit({ sourceId: toSourceId(`mouse:${button}`), pressed });
    }

    function handleKey(event: unknown, pressed: boolean): void {
        const keyCode = (event as { keyCode?: number }).keyCode;
        if (keyCode === undefined) {
            return;
        }
        emit({ sourceId: toSourceId(`key:${keyCode}`), pressed });
    }

    function syncControl(gamepad: CocosGamepadLike, name: string, control: CocosGamepadButtonLike, analog: boolean): void {
        const rawValue = control.getValue();
        const value = analog && Math.abs(rawValue) < AXIS_DEADZONE ? 0 : rawValue;
        const pressed = analog ? value !== 0 : value > 0;
        const stateKey = `${gamepad.deviceId}:${name}`;
        const previous = lastState.get(stateKey);

        if (previous !== undefined && previous.pressed === pressed && previous.value === value) {
            return;
        }
        lastState.set(stateKey, { pressed, value });
        emit({ sourceId: toSourceId(`gamepad:${gamepad.deviceId}:${name}`), pressed, value });
    }

    // 手柄断开时清空该设备控件状态，避免重连后旧状态被误判为未变化。
    // 仅清除受影响设备：多手柄场景下其它已连接手柄的派发去重不受影响。
    // 注意：断开时不补发已按住控件的释放采样（v1 降级语义，调用方不应依赖
    // 状态永远闭环，见 ADR-014 决策 4）。
    function handleGamepadChange(event: unknown): void {
        const gamepad = (event as { gamepad?: CocosGamepadLike }).gamepad;
        if (gamepad === undefined) {
            return;
        }
        const prefix = `${gamepad.deviceId}:`;
        for (const key of lastState.keys()) {
            if (key.startsWith(prefix)) {
                lastState.delete(key);
            }
        }
    }

    function handleGamepadInput(event: unknown): void {
        const gamepad = (event as { gamepad?: CocosGamepadLike }).gamepad;
        if (gamepad === undefined || !gamepad.connected) {
            return;
        }
        for (const [name, getter] of GAMEPAD_BUTTONS) {
            const control = getter(gamepad);
            if (control !== undefined) {
                syncControl(gamepad, name, control, false);
            }
        }
        for (const [name, getter] of GAMEPAD_AXES) {
            const control = getter(gamepad);
            if (control !== undefined) {
                syncControl(gamepad, name, control, true);
            }
        }
    }

    return {
        id: toSourceId("cocos-input"),
        subscribe(callback) {
            // 同一回调重复订阅去重（Set 语义）；不同订阅者并存，各自退订互不影响
            if (listeners.has(callback)) {
                return () => {};
            }
            const firstSubscriber = listeners.size === 0;
            listeners.add(callback);
            if (firstSubscriber) {
                bindEngine();
            }
            return () => {
                if (!listeners.delete(callback)) {
                    return;
                }
                // 最后一个订阅者退订时解绑引擎监听
                if (listeners.size === 0) {
                    unbindEngine();
                }
            };
        },
    };
}
