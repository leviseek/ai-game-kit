export type {
  LogContext,
  Logger,
  LogLevel,
  LogRecord,
} from "./contracts/logging/Logger";

export type {
  ApplicationContext,
  ApplicationLifecycle,
  ApplicationState,
} from "./contracts/application/ApplicationContext";

export type {
  Module,
  ModulePhase,
  ModuleRuntimeState,
} from "./contracts/module/Module";

export type {
  ApplicationVisibility,
  ApplicationVisibilityState,
  DeviceInfo,
  PlatformStorage,
} from "./contracts/platform/Platform";

export type { TimeSource } from "./contracts/time/TimeSource";

export type { DisposeHandle } from "./core/scheduling/DisposeHandle";

export type { FrameworkErrorOptions } from "./core/errors/FrameworkError";
export { FrameworkError, isRecoverableError } from "./core/errors/FrameworkError";

export type {
  EventMap,
  ScopedEventChannel,
  ScopedEventChannelOptions,
} from "./core/events/ScopedEventChannel";
export { createScopedEventChannel } from "./core/events/ScopedEventChannel";

export type {
  StateHook,
  StateMachine,
  StateMachineHooks,
  StateMachineOptions,
  StateTransitionTable,
} from "./core/fsm/StateMachine";
export { createStateMachine } from "./core/fsm/StateMachine";

export type { ObjectPool, ObjectPoolOptions } from "./core/pooling/ObjectPool";
export { createObjectPool } from "./core/pooling/ObjectPool";

export { Application } from "./application/Application";
export { ApplicationStateError } from "./application/ApplicationStateError";
export { ModuleLifecycleError } from "./application/ModuleLifecycleError";
