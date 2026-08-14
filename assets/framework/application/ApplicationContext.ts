import type { ILogger } from "../contracts/interfaces/ILogger";
import type { IApplicationContext } from "../contracts/interfaces/IApplicationContext";
import { EnumApplicationState } from "../contracts/enums/EnumApplicationState";

export function createApplicationContext(logger: ILogger): IApplicationContext {
    return {
        logger,
        get state(): EnumApplicationState {
            return EnumApplicationState.Created;
        },
    };
}
