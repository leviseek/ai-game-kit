import type { Logger } from "../contracts/logging/Logger";
import type { ApplicationContext } from "../contracts/application/ApplicationContext";

export function createApplicationContext(
  logger: Logger,
): ApplicationContext {
  return {
    logger,
    get state(): "created" {
      return "created";
    },
  };
}
