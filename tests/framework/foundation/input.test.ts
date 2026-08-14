import { describe, expect, test } from "bun:test";

import type { ITimeSource } from "../../../assets/framework/contracts/interfaces/ITimeSource";
import { MonotonicClock } from "../../../assets/framework/core/time/MonotonicClock";
import type { IInputEvent } from "../../../assets/framework/contracts/interfaces/IInputEvent";
import type { IInputSample } from "../../../assets/framework/contracts/interfaces/IInputSample";
import type { IInputSource } from "../../../assets/framework/contracts/interfaces/IInputSource";
import type { IInputSourceId } from "../../../assets/framework/contracts/interfaces/IInputSourceId";
import { createInputMapper, type InputMapper, type InputMapperOptions } from "../../../assets/framework/core/input/InputMapper";

type TestAction = "jump" | "confirm" | "move";

interface FakeInputSource extends IInputSource {
    emit(event: IInputEvent): void;
    readonly listenerCount: number;
}

// 可注入事件的测试输入源；内核替换输入源时应退订旧源、订阅新源
function createFakeSource(id: IInputSourceId): FakeInputSource {
    const listeners = new Set<(event: IInputEvent) => void>();

    return {
        id,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        emit(event) {
            for (const listener of [...listeners]) {
                listener(event);
            }
        },
        get listenerCount() {
            return listeners.size;
        },
    };
}

interface ControllableClock {
    readonly timeSource: ITimeSource;
    advance(ms: number): number;
}

function createControllableClock(): ControllableClock {
    let now = 0;

    return {
        timeSource: { now: () => now },
        advance(ms) {
            now += ms;
            return now;
        },
    };
}

function createMapper(options: Omit<InputMapperOptions<TestAction>, "onSample">, samples: IInputSample<TestAction>[]): InputMapper<TestAction> {
    return createInputMapper<TestAction>({
        ...options,
        onSample: (sample) => samples.push(sample),
    });
}

describe("input mapping", () => {
    test("a bound source emits its mapped action", () => {
        const clock = createControllableClock();
        const source = createFakeSource("keyboard");
        const samples: IInputSample<TestAction>[] = [];

        createMapper(
            {
                timeSource: clock.timeSource,
                activeContext: "gameplay",
                mappings: { gameplay: { "keyboard.space": "jump" } },
                source,
            },
            samples,
        );

        clock.advance(10);
        source.emit({ sourceId: "keyboard.space", pressed: true });

        expect(samples).toHaveLength(1);
        expect(samples[0]?.action).toBe("jump");
        expect(samples[0]?.pressed).toBe(true);
    });

    test("an unbound source produces no sample", () => {
        const clock = createControllableClock();
        const source = createFakeSource("keyboard");
        const samples: IInputSample<TestAction>[] = [];

        createMapper(
            {
                timeSource: clock.timeSource,
                activeContext: "gameplay",
                mappings: { gameplay: { "keyboard.space": "jump" } },
                source,
            },
            samples,
        );

        clock.advance(5);
        source.emit({ sourceId: "keyboard.escape", pressed: true });

        expect(samples).toEqual([]);
    });

    test("the same input maps to a different action after remapping", () => {
        const clock = createControllableClock();
        const source = createFakeSource("keyboard");
        const samples: IInputSample<TestAction>[] = [];

        const mapper = createMapper(
            {
                timeSource: clock.timeSource,
                activeContext: "gameplay",
                mappings: { gameplay: { "keyboard.space": "jump" } },
                source,
            },
            samples,
        );

        source.emit({ sourceId: "keyboard.space", pressed: true });
        mapper.setMappings({ gameplay: { "keyboard.space": "confirm" } });
        source.emit({ sourceId: "keyboard.space", pressed: true });

        expect(samples.map((sample) => sample.action)).toEqual(["jump", "confirm"]);
    });
});

describe("input context switching", () => {
    const mappings = {
        ui: { "keyboard.enter": "confirm" },
        gameplay: { "keyboard.space": "jump" },
    };

    test("an inactive context suppresses mapped inputs", () => {
        const source = createFakeSource("keyboard");
        const samples: IInputSample<TestAction>[] = [];

        createMapper(
            {
                timeSource: { now: () => 0 },
                activeContext: "ui",
                mappings,
                source,
            },
            samples,
        );

        source.emit({ sourceId: "keyboard.space", pressed: true });

        expect(samples).toEqual([]);
    });

    test("switching context takes effect immediately", () => {
        const source = createFakeSource("keyboard");
        const samples: IInputSample<TestAction>[] = [];

        const mapper = createMapper(
            {
                timeSource: { now: () => 0 },
                activeContext: "ui",
                mappings,
                source,
            },
            samples,
        );

        source.emit({ sourceId: "keyboard.enter", pressed: true });
        mapper.setActiveContext("gameplay");
        source.emit({ sourceId: "keyboard.space", pressed: true });

        expect(samples.map((sample) => sample.action)).toEqual(["confirm", "jump"]);
    });

    test("stale samples from the previous context are not dispatched", () => {
        const source = createFakeSource("keyboard");
        const samples: IInputSample<TestAction>[] = [];

        const mapper = createMapper(
            {
                timeSource: { now: () => 0 },
                activeContext: "ui",
                mappings,
                source,
            },
            samples,
        );

        source.emit({ sourceId: "keyboard.space", pressed: true });

        mapper.setActiveContext("gameplay");

        expect(samples).toEqual([]);

        source.emit({ sourceId: "keyboard.space", pressed: true });

        expect(samples.map((sample) => sample.action)).toEqual(["jump"]);
    });
});

describe("input sampling", () => {
    test("press and release produce distinguishable samples", () => {
        const source = createFakeSource("keyboard");
        const samples: IInputSample<TestAction>[] = [];

        createMapper(
            {
                timeSource: { now: () => 0 },
                activeContext: "gameplay",
                mappings: { gameplay: { "keyboard.space": "jump" } },
                source,
            },
            samples,
        );

        source.emit({ sourceId: "keyboard.space", pressed: true });
        source.emit({ sourceId: "keyboard.space", pressed: false });

        // 数字输入未携带连续值时，按下=1、释放=0
        expect(samples.map((sample) => sample.pressed)).toEqual([true, false]);
        expect(samples.map((sample) => sample.value)).toEqual([1, 0]);
    });

    test("analog input carries its continuous value", () => {
        const clock = createControllableClock();
        const source = createFakeSource("gamepad");
        const samples: IInputSample<TestAction>[] = [];

        createMapper(
            {
                timeSource: clock.timeSource,
                activeContext: "gameplay",
                mappings: { gameplay: { "gamepad.leftStickX": "move" } },
                source,
            },
            samples,
        );

        clock.advance(30);
        source.emit({
            sourceId: "gamepad.leftStickX",
            pressed: true,
            value: 0.7,
        });

        // 连续值透传，且时间戳取自注入时钟
        expect(samples[0]?.value).toBe(0.7);
        expect(samples[0]?.timestamp).toBe(30);
    });

    test("timestamps come from the injected clock and increase press to release", () => {
        const readings = [100, 160];
        const clock = new MonotonicClock(() => readings.shift() ?? 0);
        const source = createFakeSource("keyboard");
        const samples: IInputSample<TestAction>[] = [];

        createMapper(
            {
                timeSource: clock,
                activeContext: "gameplay",
                mappings: { gameplay: { "keyboard.space": "jump" } },
                source,
            },
            samples,
        );

        source.emit({ sourceId: "keyboard.space", pressed: true });
        source.emit({ sourceId: "keyboard.space", pressed: false });

        expect(samples.map((sample) => sample.timestamp)).toEqual([100, 160]);
        expect(samples[1]?.timestamp).toBeGreaterThan(samples[0]?.timestamp ?? 0);
    });
});

describe("input source replacement", () => {
    test("replacing the source stops events from the old source", () => {
        const oldSource = createFakeSource("real-device");
        const newSource = createFakeSource("test-double");
        const samples: IInputSample<TestAction>[] = [];

        const mapper = createMapper(
            {
                timeSource: { now: () => 0 },
                activeContext: "gameplay",
                mappings: { gameplay: { "keyboard.space": "jump" } },
                source: oldSource,
            },
            samples,
        );

        oldSource.emit({ sourceId: "keyboard.space", pressed: true });
        mapper.replaceSource(newSource);
        oldSource.emit({ sourceId: "keyboard.space", pressed: true });
        newSource.emit({ sourceId: "keyboard.space", pressed: true });

        expect(samples.map((sample) => sample.action)).toEqual(["jump", "jump"]);
        expect(oldSource.listenerCount).toBe(0);
        expect(newSource.listenerCount).toBe(1);
    });

    test("the new source keeps the mapping and active context semantics", () => {
        const newSource = createFakeSource("test-double");
        const samples: IInputSample<TestAction>[] = [];

        const mapper = createMapper(
            {
                timeSource: { now: () => 0 },
                activeContext: "ui",
                mappings: {
                    ui: { "keyboard.enter": "confirm" },
                    gameplay: { "keyboard.space": "jump" },
                },
                source: createFakeSource("real-device"),
            },
            samples,
        );

        mapper.replaceSource(newSource);
        newSource.emit({ sourceId: "keyboard.enter", pressed: true });
        mapper.setActiveContext("gameplay");
        newSource.emit({ sourceId: "keyboard.space", pressed: true });

        expect(samples.map((sample) => sample.action)).toEqual(["confirm", "jump"]);
    });

    test("dispose unsubscribes the current source", () => {
        const source = createFakeSource("keyboard");
        const samples: IInputSample<TestAction>[] = [];

        const mapper = createMapper(
            {
                timeSource: { now: () => 0 },
                activeContext: "gameplay",
                mappings: { gameplay: { "keyboard.space": "jump" } },
                source,
            },
            samples,
        );

        mapper.dispose();

        expect(source.listenerCount).toBe(0);
    });

    test("dispose makes mutators no-op without re-subscribing", () => {
        const source = createFakeSource("keyboard");
        const replacement = createFakeSource("test-double");
        const samples: IInputSample<TestAction>[] = [];

        const mapper = createMapper(
            {
                timeSource: { now: () => 0 },
                activeContext: "ui",
                mappings: {
                    ui: { "keyboard.enter": "confirm" },
                    gameplay: { "keyboard.space": "jump" },
                },
                source,
            },
            samples,
        );

        mapper.dispose();
        mapper.replaceSource(replacement);
        mapper.setActiveContext("gameplay");
        mapper.setMappings({ gameplay: { "keyboard.space": "jump" } });

        // dispose 后 replaceSource 不得重新订阅新源
        expect(source.listenerCount).toBe(0);
        expect(replacement.listenerCount).toBe(0);

        // 旧源与新源的事件都不再派发采样
        source.emit({ sourceId: "keyboard.enter", pressed: true });
        replacement.emit({ sourceId: "keyboard.space", pressed: true });
        expect(samples).toEqual([]);
    });
});

describe("input UI blocking", () => {
    test("a modal navigator blocks gameplay actions until it closes", () => {
        let modal = true;
        const navigator = {
            get modal() {
                return modal;
            },
        };
        const source = createFakeSource("keyboard");
        const samples: IInputSample<TestAction>[] = [];

        createMapper(
            {
                timeSource: { now: () => 0 },
                activeContext: "gameplay",
                mappings: { gameplay: { "keyboard.space": "jump" } },
                source,
                navigator,
            },
            samples,
        );

        source.emit({ sourceId: "keyboard.space", pressed: true });
        expect(samples).toEqual([]);

        modal = false;
        source.emit({ sourceId: "keyboard.space", pressed: true });

        expect(samples.map((sample) => sample.action)).toEqual(["jump"]);
    });

    test("an explicit isBlocked callback overrides the navigator", () => {
        const navigator = { modal: false };
        const source = createFakeSource("keyboard");
        const samples: IInputSample<TestAction>[] = [];

        createMapper(
            {
                timeSource: { now: () => 0 },
                activeContext: "gameplay",
                mappings: { gameplay: { "keyboard.space": "jump" } },
                source,
                navigator,
                isBlocked: () => true,
            },
            samples,
        );

        source.emit({ sourceId: "keyboard.space", pressed: true });

        expect(samples).toEqual([]);
    });

    test("a single input produces exactly one sample across contexts", () => {
        const source = createFakeSource("keyboard");
        const samples: IInputSample<TestAction>[] = [];

        // 同一输入在 ui 与 gameplay 上下文均有映射，且均激活时
        // 只按激活上下文产生一次采样，不重复派发
        const mapper = createMapper(
            {
                timeSource: { now: () => 0 },
                activeContext: "gameplay",
                mappings: {
                    ui: { "keyboard.space": "confirm" },
                    gameplay: { "keyboard.space": "jump" },
                },
                source,
            },
            samples,
        );

        source.emit({ sourceId: "keyboard.space", pressed: true });

        expect(samples).toHaveLength(1);
        expect(samples[0]?.action).toBe("jump");

        mapper.setActiveContext("ui");
        source.emit({ sourceId: "keyboard.space", pressed: true });

        expect(samples.map((sample) => sample.action)).toEqual(["jump", "confirm"]);
    });
});
