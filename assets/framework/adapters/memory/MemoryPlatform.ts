import type {
  ApplicationVisibility,
  ApplicationVisibilityState,
  DeviceInfo,
  PlatformStorage,
} from "../../contracts/platform/Platform";
import type { TimeSource } from "../../contracts/time/TimeSource";

export interface MemoryPlatformOptions {
  readonly initialVisibility?: ApplicationVisibilityState;
  readonly deviceInfo?: DeviceInfo;
  readonly initialEntries?: Readonly<Record<string, string>>;
  readonly now?: () => number;
}

export class MemoryPlatform
  implements ApplicationVisibility, PlatformStorage, DeviceInfo
{
  private currentVisibility: ApplicationVisibilityState;
  private readonly visibilityListeners = new Set<
    (state: ApplicationVisibilityState) => void
  >();
  private readonly entries = new Map<string, string>();
  private readonly timeNow: () => number;

  public readonly platform: string;
  public readonly model: string;
  public readonly language: string;

  public readonly timeSource: TimeSource;

  constructor(options: MemoryPlatformOptions = {}) {
    this.currentVisibility = options.initialVisibility ?? "foreground";
    this.platform = options.deviceInfo?.platform ?? "memory";
    this.model = options.deviceInfo?.model ?? "memory-test";
    this.language = options.deviceInfo?.language ?? "en-US";
    this.timeNow = options.now ?? (() => Date.now());
    this.timeSource = { now: () => this.timeNow() };

    if (options.initialEntries !== undefined) {
      for (const key of Object.keys(options.initialEntries)) {
        this.entries.set(key, options.initialEntries[key]);
      }
    }
  }

  get state(): ApplicationVisibilityState {
    return this.currentVisibility;
  }

  setVisibility(state: ApplicationVisibilityState): void {
    if (state === this.currentVisibility) {
      return;
    }

    this.currentVisibility = state;

    for (const listener of [...this.visibilityListeners]) {
      listener(state);
    }
  }

  onVisibilityChange(
    listener: (state: ApplicationVisibilityState) => void,
  ): () => void {
    this.visibilityListeners.add(listener);

    return () => {
      this.visibilityListeners.delete(listener);
    };
  }

  async get(key: string): Promise<string | null> {
    return this.entries.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.entries.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
}
