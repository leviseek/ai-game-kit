import type { ApplicationState } from "../contracts/application/ApplicationContext";
import type { FrameworkErrorOptions } from "../core/errors/FrameworkError";
import { FrameworkError } from "../core/errors/FrameworkError";

export class ApplicationStateError extends FrameworkError {
    readonly currentState: ApplicationState;

    constructor(currentState: ApplicationState, options: FrameworkErrorOptions = {}) {
        super(`Application is ${currentState}`, options);

        this.name = "ApplicationStateError";
        this.currentState = currentState;
    }
}
