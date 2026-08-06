import { describe, expect, test } from "bun:test";

import type { ServiceToken } from "../../../assets/framework/core/services/ServiceRegistry";
import { createServiceToken } from "../../../assets/framework/core/services/ServiceRegistry";

interface AudioService {
  readonly play: () => void;
}

describe("ServiceToken typed binding", () => {
  test("each createServiceToken call produces a distinct token", () => {
    const first: ServiceToken<AudioService> = createServiceToken<AudioService>(
      "audio",
    );
    const second: ServiceToken<AudioService> = createServiceToken<AudioService>(
      "audio",
    );

    expect(first).not.toBe(second);
  });

  test("token exposes its description for diagnostics", () => {
    const token: ServiceToken<AudioService> =
      createServiceToken<AudioService>("audio");

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
