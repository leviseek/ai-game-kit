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

export type { ServiceRegistry, ServiceToken } from "./core/services/ServiceRegistry";
export {
  ServiceRegistrationError,
  ServiceResolutionError,
  createServiceRegistry,
  createServiceToken,
} from "./core/services/ServiceRegistry";

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

export type {
  DuplicateOpenPolicy,
  UiLayer,
  UiPage,
  UiResult,
} from "./contracts/ui/Navigation";
export { UI_LAYER_ORDER } from "./contracts/ui/Navigation";

export type { UiNavigator, UiNavigatorOptions } from "./core/ui/UiNavigator";
export { createUiNavigator } from "./core/ui/UiNavigator";

export type {
  InputContextId,
  InputEvent,
  InputMapping,
  InputSample,
  InputSource,
  InputSourceId,
} from "./contracts/input/Input";

export type { InputMapper, InputMapperOptions } from "./core/input/InputMapper";
export { createInputMapper } from "./core/input/InputMapper";

export type {
  ConfigKey,
  ConfigReadType,
  ConfigTable,
  ReadonlyConfigSnapshot,
} from "./contracts/config/Config";

export {
  ConfigLoadError,
  ConfigMissingError,
  ConfigParseError,
  ConfigTypeMismatchError,
} from "./contracts/config/ConfigErrors";

export {
  configArray,
  configBoolean,
  configNumber,
  configObject,
  configString,
  createConfigTable,
} from "./core/config/ConfigTable";

export { loadConfigTable } from "./core/config/ConfigLoader";
