import { describe, expect, test } from "bun:test";

import type { ServiceToken } from "../../../assets/framework/core/services/ServiceRegistry";
import { createServiceRegistry, createServiceToken } from "../../../assets/framework/core/services/ServiceRegistry";
import { ServiceRegistrationError, ServiceResolutionError } from "../../../assets/framework/core/services/ServiceRegistry";

interface AudioService {
    readonly play: () => void;
}

describe("ServiceToken typed binding", () => {
    test("each createServiceToken call produces a distinct token", () => {
        const first: ServiceToken<AudioService> = createServiceToken<AudioService>("audio");
        const second: ServiceToken<AudioService> = createServiceToken<AudioService>("audio");

        expect(first).not.toBe(second);
    });

    test("token exposes its description for diagnostics", () => {
        const token: ServiceToken<AudioService> = createServiceToken<AudioService>("audio");

        expect(token.description).toBe("audio");
    });

    test("tokens are usable as object identity keys despite identical descriptions", () => {
        const first = createServiceToken<AudioService>("audio");
        const second = createServiceToken<AudioService>("audio");

        const registry = new Map<ServiceToken<AudioService>, AudioService>();
        registry.set(first, { play: () => {} });
        registry.set(second, { play: () => {} });

        // 相同 description 的 token 仍以各自对象身份独立存储。
        expect(registry.size).toBe(2);
    });
});

describe("ServiceRegistry register and resolve", () => {
    test("resolves an instance registered by its token", () => {
        const registry = createServiceRegistry();
        const token = createServiceToken<AudioService>("audio");
        const service: AudioService = { play: () => {} };

        registry.register(token, service);

        expect(registry.resolve(token)).toBe(service);
    });

    test("repeated resolve returns the same registered instance", () => {
        const registry = createServiceRegistry();
        const token = createServiceToken<AudioService>("audio");
        const service: AudioService = { play: () => {} };

        registry.register(token, service);

        expect(registry.resolve(token)).toBe(service);
        expect(registry.resolve(token)).toBe(service);
    });

    test("registration state is queryable per token", () => {
        const registry = createServiceRegistry();
        const registered = createServiceToken<AudioService>("audio");
        const unregistered = createServiceToken<AudioService>("other");

        registry.register(registered, { play: () => {} });

        expect(registry.isRegistered(registered)).toBe(true);
        expect(registry.isRegistered(unregistered)).toBe(false);
    });
});

describe("ServiceRegistry error paths", () => {
    test("resolving a missing token rejects with the token description", () => {
        const registry = createServiceRegistry();
        const token = createServiceToken<AudioService>("audio");

        expect(() => registry.resolve(token)).toThrow(ServiceResolutionError);
        expect(() => registry.resolve(token)).toThrow(/audio/);
    });

    test("registering the same token twice is rejected without overriding", () => {
        const registry = createServiceRegistry();
        const token = createServiceToken<AudioService>("audio");
        const first: AudioService = { play: () => {} };
        const second: AudioService = { play: () => {} };

        registry.register(token, first);

        expect(() => registry.register(token, second)).toThrow(ServiceRegistrationError);
        expect(registry.resolve(token)).toBe(first);
    });

    test("both errors carry the token description for diagnostics", () => {
        const registrationError = new ServiceRegistrationError("audio");
        const resolutionError = new ServiceResolutionError("audio");

        expect(registrationError.description).toBe("audio");
        expect(resolutionError.description).toBe("audio");
    });
});

describe("ServiceRegistry factory registration", () => {
    interface AudioPlayer {
        readonly play: () => void;
    }

    interface SoundEngine {
        readonly player: AudioPlayer;
    }

    test("a factory resolves its dependencies through the injected resolve function", () => {
        const registry = createServiceRegistry();
        const playerToken = createServiceToken<AudioPlayer>("player");
        const engineToken = createServiceToken<SoundEngine>("engine");

        registry.register(playerToken, { play: () => {} });
        registry.registerFactory(engineToken, (resolve) => ({
            player: resolve(playerToken),
        }));

        const engine = registry.resolve(engineToken);

        expect(engine.player.play).toBeTypeOf("function");
    });

    test("a factory can chain through another factory dependency", () => {
        const registry = createServiceRegistry();
        const playerToken = createServiceToken<AudioPlayer>("player");
        const engineToken = createServiceToken<SoundEngine>("engine");

        registry.registerFactory(playerToken, () => ({ play: () => {} }));
        registry.registerFactory(engineToken, (resolve) => ({
            player: resolve(playerToken),
        }));

        const engine = registry.resolve(engineToken);

        expect(engine.player.play).toBeTypeOf("function");
    });

    test("a factory can also be resolved directly", () => {
        const registry = createServiceRegistry();
        const playerToken = createServiceToken<AudioPlayer>("player");

        registry.registerFactory(playerToken, () => ({ play: () => {} }));

        const player = registry.resolve(playerToken);

        expect(player.play).toBeTypeOf("function");
    });
});

describe("ServiceRegistry dependency cycle detection", () => {
    interface ServiceA {
        readonly label: "a";
    }

    interface ServiceB {
        readonly label: "b";
    }

    test("a self-referencing factory cycle is rejected with a typed error", () => {
        const registry = createServiceRegistry();
        const aToken = createServiceToken<ServiceA>("a");

        registry.registerFactory(aToken, (resolve) => {
            resolve(aToken);
            return { label: "a" as const };
        });

        expect(() => registry.resolve(aToken)).toThrow(ServiceResolutionError);
    });

    test("a mutual dependency cycle is rejected with a typed error naming a token", () => {
        const registry = createServiceRegistry();
        const aToken = createServiceToken<ServiceA>("a");
        const bToken = createServiceToken<ServiceB>("b");

        registry.registerFactory(aToken, (resolve) => {
            resolve(bToken);
            return { label: "a" as const };
        });
        registry.registerFactory(bToken, (resolve) => {
            resolve(aToken);
            return { label: "b" as const };
        });

        expect(() => registry.resolve(aToken)).toThrow(ServiceResolutionError);
        expect(() => registry.resolve(aToken)).toThrow(/[ab]/);
    });

    test("failed resolution leaves no stale in-flight state", () => {
        const registry = createServiceRegistry();
        const aToken = createServiceToken<ServiceA>("a");
        const bToken = createServiceToken<ServiceB>("b");

        // a 工厂依赖未注册的 b：第一次解析在 b 处失败。
        registry.registerFactory(aToken, (resolve) => {
            resolve(bToken);
            return { label: "a" as const };
        });

        expect(() => registry.resolve(aToken)).toThrow(/b/);

        // 再次解析必须仍报"缺失 b"（进入 a 工厂后才失败），而非因 resolving
        // 残留误报 a 自身循环（若消息含 a 即表示进行中状态未清理）。
        expect(() => registry.resolve(aToken)).toThrow(/b/);
    });
});
