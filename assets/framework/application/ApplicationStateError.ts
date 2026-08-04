import type { ApplicationState } from "../contracts/application/ApplicationContext";
import { FrameworkError } from "../core/errors/FrameworkError";

export class ApplicationStateError extends FrameworkError {
  readonly currentState: ApplicationState;

  constructor(currentState: ApplicationState) {
    super(`Application is ${currentState}`);

    this.name = "ApplicationStateError";
    this.currentState = currentState;
  }
}
