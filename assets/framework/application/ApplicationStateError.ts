import { EnumApplicationState } from "../contracts/enums/EnumApplicationState";
import type { FrameworkErrorOptions } from "../core/errors/FrameworkError";
import { FrameworkError } from "../core/errors/FrameworkError";

export class ApplicationStateError extends FrameworkError {
    readonly currentState: EnumApplicationState;

    constructor(currentState: EnumApplicationState, options: FrameworkErrorOptions = {}) {
        super(`Application is ${currentState}`, options);

        this.name = "ApplicationStateError";
        this.currentState = currentState;
    }
}
