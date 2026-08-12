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
    InputContextId,
    InputEvent,
    InputMapping,
    InputSample,
    InputSource,
    InputSourceId,
} from "../../../assets/framework/contracts/input/Input";
import type {
    InputMapper,
    InputMapperOptions,
} from "../../../assets/framework/core/input/InputMapper";
import type {
    ScopedEventChannel,
} from "../../../assets/framework/core/events/ScopedEventChannel";
import type { DisposeHandle } from "../../../assets/framework/core/scheduling/DisposeHandle";
import type {
    ConfigKey,
    ConfigReadType,
    ConfigTable,
} from "../../../assets/framework/contracts/config/Config";
import {
    FUIBind,
    FuiView,
    getFuiComponentRegistry,
} from "../../../assets/framework";
import type {
    FuiBindOptions,
    FuiComponentEntry,
    FuiComponentRegistry,
    FuiComponentUrl,
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

type TestAction = "jump" | "move";

type _InputSourceIdIsString = Expect<Equal<InputSourceId, string>>;
type _InputContextIdIsString = Expect<Equal<InputContextId, string>>;
type _InputEventShape = Expect<
    Equal<keyof InputEvent, "sourceId" | "pressed" | "value">
>;
type _InputEventSourceIdIsReadonly = Expect<
    IsReadonlyKey<InputEvent, "sourceId">
>;
type _InputEventValueIsOptional = Expect<IsOptionalKey<InputEvent, "value">>;
type _InputSampleShape = Expect<
    Equal<
        keyof InputSample<TestAction>,
        "action" | "pressed" | "value" | "timestamp"
    >
>;
type _InputSampleActionIsGeneric = Expect<
    Equal<InputSample<TestAction>["action"], TestAction>
>;
type _InputSampleIsReadonly = Expect<
    IsReadonlyKey<InputSample<TestAction>, "action"> &
    IsReadonlyKey<InputSample<TestAction>, "pressed"> &
    IsReadonlyKey<InputSample<TestAction>, "value">
>;
type _InputMappingIsRecordOfActions = Expect<
    Equal<InputMapping<TestAction>, Readonly<Record<string, TestAction>>>
>;
type _InputSourceShape = Expect<
    Equal<keyof InputSource, "id" | "subscribe">
>;
type _InputSourceSubscribeReturnsUnsubscribe = Expect<
    Equal<InputSource["subscribe"], (listener: (event: InputEvent) => void) => () => void>
>;

type _InputMapperShape = Expect<
    Equal<
        keyof InputMapper<TestAction>,
        | "activeContext"
        | "setMappings"
        | "setActiveContext"
        | "replaceSource"
        | "dispose"
    >
>;
type _InputMapperActiveContextIsReadonly = Expect<
    IsReadonlyKey<InputMapper<TestAction>, "activeContext">
>;
type _InputMapperSetMappingsIsTyped = Expect<
    Equal<
        InputMapper<TestAction>["setMappings"],
        (mappings: Readonly<Record<InputContextId, InputMapping<TestAction>>>) => void
    >
>;
type _InputMapperReplaceSourceIsTyped = Expect<
    Equal<InputMapper<TestAction>["replaceSource"], (source: InputSource) => void>
>;
type _InputMapperDisposeIsVoid = Expect<
    Equal<InputMapper<TestAction>["dispose"], () => void>
>;
type _InputMapperOptionsNavigatorIsOptional = Expect<
    IsOptionalKey<InputMapperOptions<TestAction>, "navigator">
>;
type _InputMapperOptionsIsBlockedIsOptional = Expect<
    IsOptionalKey<InputMapperOptions<TestAction>, "isBlocked">
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

type _ConfigKeyIsString = Expect<Equal<ConfigKey, string>>;

type _ConfigTableShape = Expect<
    Equal<keyof ConfigTable, "read" | "snapshot">
>;
type _ConfigTableReadIsOverloadedWithDefault = Expect<
    Equal<
        ConfigTable["read"],
        {
            <T>(key: ConfigKey, type: ConfigReadType<T>): T;
            <T>(key: ConfigKey, type: ConfigReadType<T>, defaultValue: T): T;
        }
    >
>;
type _ConfigReadTypeParsesUnknownToDeclared = Expect<
    Equal<
        ConfigReadType<number>["parse"],
        (key: ConfigKey, raw: unknown) => number
    >
>;
type _ConfigTableSnapshotReturnsReadonly = Expect<
    Equal<
        ConfigTable["snapshot"],
        () => Readonly<Record<ConfigKey, unknown>>
    >
>;

type _FuiComponentUrlIsTemplateLiteral = Expect<
    Equal<FuiComponentUrl, `ui://${string}/${string}`>
>;
type _FuiBindOptionsHasSingleRequiredKey = Expect<
    Equal<keyof FuiBindOptions, "runtimeBinding">
> &
    Expect<Equal<FuiBindOptions["runtimeBinding"], "required" | "none">>;
type _EntryCarriesRuntimeBinding = Expect<
    Equal<FuiComponentEntry["runtimeBinding"], "required" | "none">
>;
type _RegistryUrlIsBranded = Expect<
    Equal<Parameters<FuiComponentRegistry["register"]>[0], FuiComponentUrl> &
        Equal<Parameters<FuiComponentRegistry["lookup"]>[0], FuiComponentUrl>
>;

class _FuiTypecheckView extends FuiView<unknown, unknown> {
    protected onConstruct(): void { }
    protected onState(): void { }
}

const _registry = getFuiComponentRegistry();
const _plainUrl: string = "ui" + "://Demo/Test";
const _entry: FuiComponentEntry = {
    ctor: _FuiTypecheckView,
    fields: {},
    clicks: [],
    runtimeBinding: "none",
};

// @ts-expect-error 普通 string 不满足 FuiComponentUrl（模板字面量品牌类型）
_registry.register(_plainUrl, _entry);
// @ts-expect-error 普通 string 不满足 FuiComponentUrl（模板字面量品牌类型）
_registry.lookup(_plainUrl);

const _brandedUrl = ("ui" + "://Demo/Test") as FuiComponentUrl;
_registry.lookup(_brandedUrl);

// @ts-expect-error FUIBind 缺少必填 options.runtimeBinding
FUIBind(_brandedUrl, { txt_status: "text" });
FUIBind(_brandedUrl, { txt_status: "text" }, { runtimeBinding: "none" });
