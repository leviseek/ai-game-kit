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
