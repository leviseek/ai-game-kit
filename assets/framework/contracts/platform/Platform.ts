export type ApplicationVisibilityState = "foreground" | "background";

export interface ApplicationVisibility {
  readonly state: ApplicationVisibilityState;
  setVisibility(state: ApplicationVisibilityState): void;
  onVisibilityChange(
    listener: (state: ApplicationVisibilityState) => void,
  ): () => void;
}

export interface PlatformStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface DeviceInfo {
  readonly platform: string;
  readonly model: string;
  readonly language: string;
}
