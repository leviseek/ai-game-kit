import type {
  Application,
  ApplicationContext,
  ApplicationLifecycle,
  ApplicationState,
  LogContext,
  LogLevel,
  LogRecord,
  Logger,
  Module,
  ModulePhase,
  ModuleRuntimeState,
} from "../../../assets/framework";
import type {
  ApplicationVisibility,
  ApplicationVisibilityState,
  DeviceInfo,
  PlatformStorage,
} from "../../../assets/framework/contracts/platform/Platform";
import type { TimeSource } from "../../../assets/framework/contracts/time/TimeSource";
import type {
  ScopedEventChannel,
} from "../../../assets/framework/core/events/ScopedEventChannel";
import type { DisposeHandle } from "../../../assets/framework/core/scheduling/DisposeHandle";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;

type Expect<Type extends true> = Type;

type IsReadonlyKey<Type, Key extends keyof Type> = Equal<
  Pick<Type, Key>,
  Readonly<Pick<Type, Key>>
>;

type IsOptionalKey<Type, Key extends keyof Type> = {} extends Pick<Type, Key>
  ? true
  : false;

type NeverKey<Type, Key extends string> = Equal<
  Extract<keyof Type, Key>,
  never
>;

type LifecycleHookName =
  | "initialize"
  | "start"
  | "pause"
  | "resume"
  | "stop"
  | "dispose";

type ExpectedLifecycleHook = (
  context: ApplicationContext,
) => void | Promise<void>;

type _ApplicationContextShape = Expect<
  Equal<keyof ApplicationContext, "logger" | "state">
>;
type _ApplicationLifecycleShape = Expect<
  Equal<keyof ApplicationLifecycle, "state">
>;
type _ApplicationStateIsClosedUnion = Expect<
  Equal<
    ApplicationState,
    | "created"
    | "initializing"
    | "running"
    | "paused"
    | "stopping"
    | "disposed"
  >
>;
type _ApplicationPublicShape = Expect<
  Equal<
    keyof Application,
    "dispose" | "pause" | "resume" | "start" | "state"
  >
>;
type _ApplicationStateIsReadonly = Expect<IsReadonlyKey<Application, "state">>;
type _ApplicationStateIsLifecycleState = Expect<
  Equal<Application["state"], ApplicationState>
>;
type _ApplicationOperationsReturnPromises = Expect<
  Equal<Application["start"], () => Promise<void>> &
    Equal<Application["pause"], () => Promise<void>> &
    Equal<Application["resume"], () => Promise<void>> &
    Equal<Application["dispose"], () => Promise<void>>
>;
type _ApplicationContextHasNoServiceLocator = Expect<
  NeverKey<ApplicationContext, "get" | "resolve" | "registry" | "container" | "provide">
>;
type _ApplicationContextHasNoApplicationIdentity = Expect<
  NeverKey<ApplicationContext, "application" | "app" | "identity" | "owner">
>;

type _ModuleShape = Expect<
  Equal<keyof Module, "id" | "dependencies" | LifecycleHookName>
>;
type _ModuleIdIsString = Expect<Equal<Module["id"], string>>;
type _ModuleIdIsReadonly = Expect<IsReadonlyKey<Module, "id">>;
type _DependenciesAreReadonlyIds = Expect<
  Equal<Module["dependencies"], readonly string[]>
>;
type _DependenciesDoNotContainModules = Expect<
  Equal<Extract<Module["dependencies"][number], Module>, never>
>;
type _ModulePhaseIsClosedUnion = Expect<Equal<ModulePhase, LifecycleHookName>>;
type _ModuleRuntimeStateIsClosedUnion = Expect<
  Equal<
    ModuleRuntimeState,
    | "registered"
    | "initialized"
    | "started"
    | "paused"
    | "stopped"
    | "disposed"
  >
>;
type _ModuleHasNoManagerPattern = Expect<
  NeverKey<Module, "create" | "register" | "configure" | "manager" | "builder">
>;
type _ModuleHasNoEventBus = Expect<
  NeverKey<Module, "on" | "emit" | "subscribe" | "publish" | "events">
>;
type _LifecycleHooksAreOptional = Expect<
  Equal<
    {
      [Hook in LifecycleHookName]: IsOptionalKey<Module, Hook>;
    }[LifecycleHookName],
    true
  >
>;
type _LifecycleHooksUseApplicationContext = Expect<
  Equal<
    {
      [Hook in LifecycleHookName]: Equal<
        NonNullable<Module[Hook]>,
        ExpectedLifecycleHook
      >;
    }[LifecycleHookName],
    true
  >
>;

type _LoggerShape = Expect<
  Equal<keyof Logger, "debug" | "info" | "warn" | "error" | "child">
>;
type _LogLevelIsClosedUnion = Expect<
  Equal<LogLevel, "debug" | "info" | "warn" | "error">
>;
type _LogContextIsRecord = Expect<
  Equal<LogContext, Readonly<Record<string, unknown>>>
>;
type _LogRecordShape = Expect<
  Equal<
    LogRecord,
    Readonly<{
      level: LogLevel;
      message: string;
      timestamp: number;
      scope: string;
      context: LogContext;
      error?: Error & { readonly cause?: unknown };
    }>
  >
>;

type _PlatformShape = Expect<
  Equal<
    keyof ApplicationVisibility,
    "state" | "onVisibilityChange" | "setVisibility"
  >
>;
type _ApplicationVisibilityStateIsClosedUnion = Expect<
  Equal<ApplicationVisibilityState, "foreground" | "background">
>;
type _ApplicationVisibilityStateIsReadonly = Expect<
  IsReadonlyKey<ApplicationVisibility, "state">
>;
type _PlatformStorageShape = Expect<
  Equal<keyof PlatformStorage, "delete" | "get" | "set">
>;
type _PlatformStorageReturnsPromises = Expect<
  Equal<PlatformStorage["get"], (key: string) => Promise<string | null>> &
    Equal<PlatformStorage["set"], (key: string, value: string) => Promise<void>> &
    Equal<PlatformStorage["delete"], (key: string) => Promise<void>>
>;
type _DeviceInfoShape = Expect<
  Equal<keyof DeviceInfo, "language" | "model" | "platform">
>;
type _DeviceInfoIsReadonly = Expect<
  IsReadonlyKey<DeviceInfo, "platform"> &
    IsReadonlyKey<DeviceInfo, "model"> &
    IsReadonlyKey<DeviceInfo, "language">
>;
type _TimeSourceShape = Expect<Equal<keyof TimeSource, "now">>;
type _TimeSourceReturnsNumber = Expect<
  Equal<TimeSource["now"], () => number>
>;

type ScopedEvents = {
  readonly scoreChanged: { readonly score: number };
};

type _ScopedEventChannelShape = Expect<
  Equal<keyof ScopedEventChannel<ScopedEvents>, "dispose" | "emit" | "on">
>;
type _ScopedEventChannelOnReturnsDisposeHandle = Expect<
  Equal<
    ScopedEventChannel<ScopedEvents>["on"],
    <EventName extends keyof ScopedEvents>(
      event: EventName,
      handler: (payload: ScopedEvents[EventName]) => void,
    ) => DisposeHandle
  >
>;
type _ScopedEventChannelEmitIsTyped = Expect<
  Equal<
    ScopedEventChannel<ScopedEvents>["emit"],
    <EventName extends keyof ScopedEvents>(
      event: EventName,
      payload: ScopedEvents[EventName],
    ) => void
  >
>;
