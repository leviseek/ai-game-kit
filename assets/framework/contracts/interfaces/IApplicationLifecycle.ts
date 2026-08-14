import type { EnumApplicationState } from "../enums/EnumApplicationState";

export interface IApplicationLifecycle {
    readonly state: EnumApplicationState;
}
