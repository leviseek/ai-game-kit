import type { Logger } from "../logging/Logger";

export type ApplicationState =
  | "created"
  | "initializing"
  | "running"
  | "paused"
  | "stopping"
  | "disposed";

export interface ApplicationLifecycle {
  readonly state: ApplicationState;
}

export interface ApplicationContext extends ApplicationLifecycle {
  readonly logger: Logger;
}
