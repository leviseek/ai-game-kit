import type { Logger } from "../contracts/logging/Logger";
import type {
  ApplicationContext,
  ApplicationState,
} from "../contracts/application/ApplicationContext";

export interface InternalApplicationContext extends ApplicationContext {
  _setState(next: ApplicationState): void;
}

export function createApplicationContext(
  logger: Logger,
): InternalApplicationContext {
  let currentState: ApplicationState = "created";

  return {
    logger,
    get state() {
      return currentState;
    },
    _setState(next: ApplicationState) {
      currentState = next;
    },
  };
}
