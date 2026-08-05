/**
 * 框架公开 API 白名单：仅 re-export 稳定契约类型与核心工厂/类，
 * 是业务代码的推荐导入入口；内部实现经此隔离，不直接深层导入。
 */
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

export type {
  ResourceHandle,
  ResourceKey,
  ResourceKind,
  ResourceLoadState,
} from "./contracts/resource/Resource";

export type { ResourceScope } from "./contracts/resource/ResourceScope";

export type {
  IResourceProvider,
  ResourceProviderOptions,
} from "./contracts/resource/ResourceProvider";

export { createResourceProvider } from "./core/resource/ResourceProvider";

export type {
  SceneFlow,
  SceneFlowOptions,
  SceneFlowState,
  SceneResources,
  SceneSwitchResult,
} from "./core/scene/SceneFlow";
export { createSceneFlow } from "./core/scene/SceneFlow";
