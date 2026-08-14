import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, mock, test } from "bun:test";

// 注意：bun 在同一进程运行所有测试文件，mock.module("cc") 全局共享且首个注册
// 生效、后续同路径注册被忽略。因此本文件不依赖全局 cc 缺省值做行为断言；
// 缺省 input/EventType 路径改用源码断言锁定（与 cocos-scene-adapter 一致）。
mock.module("cc", () => ({
    input: {},
    Input: {
        EventType: {},
    },
}));

import type { IInputEvent } from "../../../assets/framework/contracts/interfaces/IInputEvent";
import type { IInputSourceId } from "../../../assets/framework/contracts/interfaces/IInputSourceId";
import { createInputMapper, type InputMapper } from "../../../assets/framework/core/input/InputMapper";

type TestAction = "jump" | "move" | "confirm";

interface CocosInputLike {
    on(eventType: string, callback: (event: unknown) => void, target: unknown): void;
    off(eventType: string, callback: (event: unknown) => void, target: unknown): void;
}

interface MockInput extends CocosInputLike {
    readonly registrations: Array<[string, (event: unknown) => void, unknown]>;
    readonly unregistrations: Array<[string, (event: unknown) => void, unknown]>;
    emit(eventType: string, event: unknown): void;
}

interface CocosInputAdapterFactory {
    createCocosInputAdapter(options?: {
        readonly input?: CocosInputLike;
        readonly eventTypes?: {
            readonly touchStart: string;
            readonly touchEnd: string;
            readonly touchCancel: string;
            readonly mouseDown: string;
            readonly mouseUp: string;
            readonly keyDown: string;
            readonly keyUp: string;
            readonly gamepadChange: string;
            readonly gamepadInput: string;
        };
    }): { readonly id: IInputSourceId; subscribe(callback: (event: IInputEvent) => void): () => void };
}

const projectRoot = resolve(import.meta.dir, "../../..");
const adapterFile = resolve(projectRoot, "assets/framework/adapters/cocos/input/CocosInputAdapter.ts");

async function loadFactory(): Promise<CocosInputAdapterFactory> {
    const exports = (await import(pathToFileURL(adapterFile).href)) as Partial<CocosInputAdapterFactory>;

    expect(typeof exports.createCocosInputAdapter).toBe("function");

    return {
        createCocosInputAdapter: exports.createCocosInputAdapter as CocosInputAdapterFactory["createCocosInputAdapter"],
    };
}

function createMockInput(): MockInput {
    const registrations: Array<[string, (event: unknown) => void, unknown]> = [];
    const unregistrations: Array<[string, (event: unknown) => void, unknown]> = [];

    return {
        registrations,
        unregistrations,
        on(eventType, callback, target) {
            registrations.push([eventType, callback, target]);
        },
        off(eventType, callback, target) {
            unregistrations.push([eventType, callback, target]);
            // 模拟引擎 CallbacksInvoker 的引用匹配语义：仅删除同 callback 且同
            // target 的注册项，使退订后的 emit 不再派发给该 handler
            const index = registrations.findIndex(([type, registered, registeredTarget]) => type === eventType && registered === callback && registeredTarget === target);
            if (index >= 0) {
                registrations.splice(index, 1);
            }
        },
        emit(eventType, event) {
            for (const [type, callback] of [...registrations]) {
                if (type === eventType) {
                    callback(event);
                }
            }
        },
    };
}

const EVENT_TYPES = {
    touchStart: "touch-start",
    touchEnd: "touch-end",
    touchCancel: "touch-cancel",
    mouseDown: "mouse-down",
    mouseUp: "mouse-up",
    keyDown: "keydown",
    keyUp: "keyup",
    gamepadChange: "gamepad-change",
    gamepadInput: "gamepad-input",
};

function createGamepad(overrides: {
    connected?: boolean;
    deviceId?: number;
    buttons?: Partial<Record<string, { getValue(): number }>>;
    axes?: Partial<Record<string, { getValue(): number }>>;
}): { connected: boolean; deviceId: number } & Record<string, unknown> {
    const buttons = overrides.buttons ?? {};
    const axes = overrides.axes ?? {};

    const gamepad: Record<string, unknown> = {
        connected: overrides.connected ?? true,
        deviceId: overrides.deviceId ?? 0,
    };

    for (const [name, control] of Object.entries(buttons)) {
        gamepad[name] = control;
    }
    for (const [name, control] of Object.entries(axes)) {
        gamepad[name] = { xAxis: control, yAxis: control };
    }

    return gamepad;
}

describe("CocosInputAdapter translation", () => {
    test("touch start emits a pressed input and touch end emits a release", async () => {
        const { createCocosInputAdapter } = await loadFactory();
        const mockInput = createMockInput();
        const adapter = createCocosInputAdapter({ input: mockInput, eventTypes: EVENT_TYPES });
        const events: IInputEvent[] = [];

        const unsubscribe = adapter.subscribe((event) => events.push(event));

        mockInput.emit(EVENT_TYPES.touchStart, { touch: { getID: () => 3 } });
        mockInput.emit(EVENT_TYPES.touchEnd, { touch: { getID: () => 3 } });

        expect(events).toEqual([
            { sourceId: "touch:3", pressed: true },
            { sourceId: "touch:3", pressed: false },
        ]);

        unsubscribe();
    });

    test("mouse down and up emit the mapped button", async () => {
        const { createCocosInputAdapter } = await loadFactory();
        const mockInput = createMockInput();
        const adapter = createCocosInputAdapter({ input: mockInput, eventTypes: EVENT_TYPES });
        const events: IInputEvent[] = [];

        const unsubscribe = adapter.subscribe((event) => events.push(event));

        mockInput.emit(EVENT_TYPES.mouseDown, { getButton: () => 0 });
        mockInput.emit(EVENT_TYPES.mouseUp, { getButton: () => 0 });

        expect(events).toEqual([
            { sourceId: "mouse:0", pressed: true },
            { sourceId: "mouse:0", pressed: false },
        ]);

        unsubscribe();
    });

    test("key down and up emit the key code", async () => {
        const { createCocosInputAdapter } = await loadFactory();
        const mockInput = createMockInput();
        const adapter = createCocosInputAdapter({ input: mockInput, eventTypes: EVENT_TYPES });
        const events: IInputEvent[] = [];

        const unsubscribe = adapter.subscribe((event) => events.push(event));

        mockInput.emit(EVENT_TYPES.keyDown, { keyCode: 32 });
        mockInput.emit(EVENT_TYPES.keyUp, { keyCode: 32 });

        expect(events).toEqual([
            { sourceId: "key:32", pressed: true },
            { sourceId: "key:32", pressed: false },
        ]);

        unsubscribe();
    });

    test("a connected gamepad button emits a gamepad source", async () => {
        const { createCocosInputAdapter } = await loadFactory();
        const mockInput = createMockInput();
        const adapter = createCocosInputAdapter({ input: mockInput, eventTypes: EVENT_TYPES });
        const events: IInputEvent[] = [];

        const unsubscribe = adapter.subscribe((event) => events.push(event));

        const gamepad = createGamepad({
            buttons: { buttonSouth: { getValue: () => 1 } },
        });
        mockInput.emit(EVENT_TYPES.gamepadInput, { gamepad });

        expect(events).toEqual([{ sourceId: "gamepad:0:south", pressed: true, value: 1 }]);

        unsubscribe();
    });

    test("a disconnected or missing gamepad degrades to no input", async () => {
        const { createCocosInputAdapter } = await loadFactory();
        const mockInput = createMockInput();
        const adapter = createCocosInputAdapter({ input: mockInput, eventTypes: EVENT_TYPES });
        const events: IInputEvent[] = [];

        const unsubscribe = adapter.subscribe((event) => events.push(event));

        mockInput.emit(EVENT_TYPES.gamepadInput, { gamepad: undefined });
        mockInput.emit(EVENT_TYPES.gamepadInput, {
            gamepad: createGamepad({ connected: false }),
        });

        expect(events).toEqual([]);

        unsubscribe();
    });

    test("an axis below the deadzone emits a neutral value", async () => {
        const { createCocosInputAdapter } = await loadFactory();
        const mockInput = createMockInput();
        const adapter = createCocosInputAdapter({ input: mockInput, eventTypes: EVENT_TYPES });
        const events: IInputEvent[] = [];

        const unsubscribe = adapter.subscribe((event) => events.push(event));

        // 低于死区的微抖动归零且视为未按下
        mockInput.emit(EVENT_TYPES.gamepadInput, {
            gamepad: createGamepad({
                axes: { leftStick: { getValue: () => 0.01 } },
            }),
        });

        expect(events).toEqual([
            { sourceId: "gamepad:0:leftStickX", pressed: false, value: 0 },
            { sourceId: "gamepad:0:leftStickY", pressed: false, value: 0 },
        ]);

        unsubscribe();
    });

    test("reconnecting a gamepad re-emits changed controls after a disconnect", async () => {
        const { createCocosInputAdapter } = await loadFactory();
        const mockInput = createMockInput();
        const adapter = createCocosInputAdapter({ input: mockInput, eventTypes: EVENT_TYPES });
        const events: IInputEvent[] = [];

        const unsubscribe = adapter.subscribe((event) => events.push(event));

        const gamepad = createGamepad({
            buttons: { buttonSouth: { getValue: () => 1 } },
        });
        mockInput.emit(EVENT_TYPES.gamepadInput, { gamepad });
        expect(events).toHaveLength(1);

        // 断开后状态清空；同值重连应重新派发（未被旧状态去重吞掉）
        mockInput.emit(EVENT_TYPES.gamepadChange, { gamepad });
        mockInput.emit(EVENT_TYPES.gamepadInput, { gamepad });

        expect(events.map((event) => event.sourceId)).toEqual(["gamepad:0:south", "gamepad:0:south"]);

        unsubscribe();
    });

    test("subscribe registers listeners and unsubscribe removes them", async () => {
        const { createCocosInputAdapter } = await loadFactory();
        const mockInput = createMockInput();
        const adapter = createCocosInputAdapter({ input: mockInput, eventTypes: EVENT_TYPES });

        const expectedTypes = [
            EVENT_TYPES.touchStart,
            EVENT_TYPES.touchEnd,
            EVENT_TYPES.touchCancel,
            EVENT_TYPES.mouseDown,
            EVENT_TYPES.mouseUp,
            EVENT_TYPES.keyDown,
            EVENT_TYPES.keyUp,
            EVENT_TYPES.gamepadChange,
            EVENT_TYPES.gamepadInput,
        ];

        const unsubscribe = adapter.subscribe(() => {});
        expect(mockInput.registrations.map(([type]) => type)).toEqual(expectedTypes);

        const registeredTarget = mockInput.registrations[0]?.[2];

        unsubscribe();
        expect(mockInput.unregistrations.map(([type]) => type)).toEqual(expectedTypes);
        expect(mockInput.unregistrations[0]?.[2]).toBe(registeredTarget);
        // off 按引用匹配移除了对应注册项
        expect(mockInput.registrations).toHaveLength(0);
    });

    test("multiple subscribers coexist; engine binds once and unbinds when the last leaves (P2-1)", async () => {
        const { createCocosInputAdapter } = await loadFactory();
        const mockInput = createMockInput();
        const adapter = createCocosInputAdapter({ input: mockInput, eventTypes: EVENT_TYPES });
        const a: IInputEvent[] = [];
        const b: IInputEvent[] = [];

        const unsubscribeA = adapter.subscribe((event) => a.push(event));
        expect(mockInput.registrations).toHaveLength(9);
        const unsubscribeB = adapter.subscribe((event) => b.push(event));
        // 第二个订阅者不重复绑定引擎监听
        expect(mockInput.registrations).toHaveLength(9);

        mockInput.emit(EVENT_TYPES.keyDown, { keyCode: 32 });
        expect(a).toHaveLength(1);
        expect(b).toHaveLength(1);

        // 退订 B：B 不再收到事件，A 继续（引擎监听保持绑定）
        unsubscribeB();
        mockInput.emit(EVENT_TYPES.keyDown, { keyCode: 32 });
        expect(b).toHaveLength(1);
        expect(a).toHaveLength(2);
        expect(mockInput.unregistrations).toHaveLength(0);

        // 最后一个订阅者退订：引擎监听全部解绑
        unsubscribeA();
        expect(mockInput.unregistrations).toHaveLength(9);
        mockInput.emit(EVENT_TYPES.keyDown, { keyCode: 32 });
        expect(a).toHaveLength(2);
    });

    test("same callback re-subscribes as a no-op (Set dedup)", async () => {
        const { createCocosInputAdapter } = await loadFactory();
        const mockInput = createMockInput();
        const adapter = createCocosInputAdapter({ input: mockInput, eventTypes: EVENT_TYPES });

        const callback = () => {};
        const unsubscribeA = adapter.subscribe(callback);
        const unsubscribeB = adapter.subscribe(callback);

        expect(mockInput.registrations).toHaveLength(9);

        unsubscribeB();
        expect(mockInput.unregistrations).toHaveLength(0);

        unsubscribeA();
        expect(mockInput.unregistrations).toHaveLength(9);
    });

    test("unsubscribe stops delivering events and re-subscribe does not double-register", async () => {
        const { createCocosInputAdapter } = await loadFactory();
        const mockInput = createMockInput();
        const adapter = createCocosInputAdapter({ input: mockInput, eventTypes: EVENT_TYPES });
        const events: IInputEvent[] = [];

        const unsubscribe = adapter.subscribe((event) => events.push(event));

        mockInput.emit(EVENT_TYPES.keyDown, { keyCode: 32 });
        expect(events).toHaveLength(1);

        unsubscribe();
        // off 按 callback 引用匹配后，emit 不再派发
        mockInput.emit(EVENT_TYPES.keyDown, { keyCode: 32 });
        expect(events).toHaveLength(1);

        // 重新订阅不产生重复监听：同一事件只派发一次
        const unsubscribe2 = adapter.subscribe((event) => events.push(event));
        mockInput.emit(EVENT_TYPES.keyDown, { keyCode: 32 });
        expect(events).toHaveLength(2);
        expect(mockInput.registrations).toHaveLength(9);

        unsubscribe2();
    });

    test("touch cancel emits a release", async () => {
        const { createCocosInputAdapter } = await loadFactory();
        const mockInput = createMockInput();
        const adapter = createCocosInputAdapter({ input: mockInput, eventTypes: EVENT_TYPES });
        const events: IInputEvent[] = [];

        const unsubscribe = adapter.subscribe((event) => events.push(event));

        mockInput.emit(EVENT_TYPES.touchCancel, { touch: { getID: () => 7 } });

        expect(events).toEqual([{ sourceId: "touch:7", pressed: false }]);

        unsubscribe();
    });

    test("defaults to cc.input and cc.Input.EventType when not injected", async () => {
        const { createCocosInputAdapter } = await loadFactory();

        const adapter = createCocosInputAdapter();

        expect(typeof adapter.subscribe).toBe("function");

        // bun 的 mock.module("cc") 全局共享且首个注册生效，无法在全量运行下可靠地
        // 观察缺省 cc.input 路径；改用源码断言锁定"未注入时读取引擎默认实例"。
        const source = readFileSync(adapterFile, "utf8");
        expect(source).toMatch(/cc\.input/);
        expect(source).toMatch(/cc\.Input\.EventType/);
        expect(source).toMatch(/options\.input\s*\?\?/);
    });
});

describe("CocosInputAdapter integration with InputMapper", () => {
    async function createRig(
        mappings: Record<string, TestAction>,
        navigator?: { readonly modal: boolean },
    ): Promise<{
        mapper: InputMapper<TestAction>;
        mockInput: MockInput;
        samples: Array<{ action: TestAction; pressed: boolean }>;
        adapter: { subscribe(callback: (event: IInputEvent) => void): () => void };
    }> {
        const { createCocosInputAdapter } = await loadFactory();
        const mockInput = createMockInput();
        const adapter = createCocosInputAdapter({ input: mockInput, eventTypes: EVENT_TYPES });
        const samples: Array<{ action: TestAction; pressed: boolean }> = [];

        const mapper = createInputMapper<TestAction>({
            timeSource: { now: () => 0 },
            activeContext: "gameplay",
            mappings: { gameplay: mappings },
            source: adapter,
            navigator,
            onSample: (sample) => samples.push({ action: sample.action, pressed: sample.pressed }),
        });

        return { mapper, mockInput, samples, adapter };
    }

    test("a real touch path produces the mapped action", async () => {
        const rig = await createRig({ "touch:1": "jump" });

        rig.mockInput.emit(EVENT_TYPES.touchStart, { touch: { getID: () => 1 } });

        expect(rig.samples).toEqual([{ action: "jump", pressed: true }]);

        rig.mapper.dispose();
    });

    test("a keyboard path produces the mapped action", async () => {
        const rig = await createRig({ "key:32": "jump" });

        rig.mockInput.emit(EVENT_TYPES.keyDown, { keyCode: 32 });

        expect(rig.samples).toEqual([{ action: "jump", pressed: true }]);

        rig.mapper.dispose();
    });

    test("a modal navigator blocks gameplay actions and releases after close", async () => {
        let modal = true;
        const navigator = {
            get modal() {
                return modal;
            },
        };
        const rig = await createRig({ "touch:1": "jump" }, navigator);

        rig.mockInput.emit(EVENT_TYPES.touchStart, { touch: { getID: () => 1 } });
        expect(rig.samples).toEqual([]);

        modal = false;
        rig.mockInput.emit(EVENT_TYPES.touchStart, { touch: { getID: () => 1 } });
        expect(rig.samples).toEqual([{ action: "jump", pressed: true }]);

        rig.mapper.dispose();
    });
});
