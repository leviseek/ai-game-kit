import { EnumModulePhase } from "../contracts/enums/EnumModulePhase";
import { FrameworkError } from "../core/errors/FrameworkError";

export class ModuleLifecycleError extends FrameworkError {
    declare readonly moduleId: string;
    declare readonly phase: EnumModulePhase;

    constructor(moduleId: string, phase: EnumModulePhase, cause: unknown) {
        super("IModule lifecycle failed", {
            cause,
            moduleId,
            phase,
        });

        this.name = "ModuleLifecycleError";
    }
}
