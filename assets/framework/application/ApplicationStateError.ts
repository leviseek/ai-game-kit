import type { ApplicationState } from "../contracts/application/ApplicationContext";

export class ApplicationStateError extends Error {
  readonly currentState: ApplicationState;

  constructor(currentState: ApplicationState) {
    super(`Application is ${currentState}`);
    this.name = "ApplicationStateError";
    this.currentState = currentState;
  }
}
