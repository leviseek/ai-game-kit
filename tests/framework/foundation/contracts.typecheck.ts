import type { Application, IApplicationContext, IApplicationLifecycle, ILogContext, ILogRecord, ILogger, IModule } from "../../../assets/framework";
import { EnumApplicationState, EnumLogLevel, EnumModulePhase, EnumModuleRuntimeState } from "../../../assets/framework";
import type { IApplicationVisibility } from "../../../assets/framework/contracts/interfaces/IApplicationVisibility";
import type { IDeviceInfo } from "../../../assets/framework/contracts/interfaces/IDeviceInfo";
import type { IPlatformStorage } from "../../../assets/framework/contracts/interfaces/IPlatformStorage";
import type { EnumApplicationVisibilityState } from "../../../assets/framework/contracts/enums/EnumApplicationVisibilityState";
import type { ITimeSource } from "../../../assets/framework/contracts/interfaces/ITimeSource";
import type { IInputContextId } from "../../../assets/framework/contracts/interfaces/IInputContextId";
import type { IInputEvent } from "../../../assets/framework/contracts/interfaces/IInputEvent";
import type { IInputMapping } from "../../../assets/framework/contracts/interfaces/IInputMapping";
import type { IInputSample } from "../../../assets/framework/contracts/interfaces/IInputSample";
import type { IInputSource } from "../../../assets/framework/contracts/interfaces/IInputSource";
import type { IInputSourceId } from "../../../assets/framework/contracts/interfaces/IInputSourceId";
import type { InputMapper, InputMapperOptions } from "../../../assets/framework/core/input/InputMapper";
import type { ScopedEventChannel } from "../../../assets/framework/core/events/ScopedEventChannel";
import type { DisposeHandle } from "../../../assets/framework/core/scheduling/DisposeHandle";
import type { IConfigKey } from "../../../assets/framework/contracts/interfaces/IConfigKey";
import type { IConfigReadType } from "../../../assets/framework/contracts/interfaces/IConfigReadType";
import type { IConfigTable } from "../../../assets/framework/contracts/interfaces/IConfigTable";
import type { IReadonlyConfigSnapshot } from "../../../assets/framework/contracts/interfaces/IReadonlyConfigSnapshot";
import { FUIBind, FuiView, getFuiComponentRegistry } from "../../../assets/framework";
import type { FuiBindOptions, FuiComponentEntry, FuiComponentRegistry, FuiComponentUrl } from "../../../assets/framework";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;

type Expect<Type extends true> = Type;

type IsReadonlyKey<Type, Key extends keyof Type> = Equal<Pick<Type, Key>, Readonly<Pick<Type, Key>>>;

type IsOptionalKey<Type, Key extends keyof Type> = {} extends Pick<Type, Key> ? true : false;

type NeverKey<Type, Key extends string> = Equal<Extract<keyof Type, Key>, never>;

type LifecycleHookName = "initialize" | "start" | "pause" | "resume" | "stop" | "dispose";

type ExpectedLifecycleHook = (context: IApplicationContext) => void | Promise<void>;

type _ApplicationContextShape = Expect<Equal<keyof IApplicationContext, "logger" | "state">>;
type _ApplicationLifecycleShape = Expect<Equal<keyof IApplicationLifecycle, "state">>;
// string enum：成员名与运行期字符串值锁定（enum 类型无法与成员联合做 Equal，
// 用"成员值类型可赋给其字符串字面量"与"成员名集合"双断言锁定形状）
type _ApplicationStateIsClosedUnion = Expect<Equal<keyof typeof EnumApplicationState, "Created" | "Initializing" | "Running" | "Paused" | "Stopping" | "Disposed">>;
type _ApplicationPublicShape = Expect<Equal<keyof Application, "dispose" | "pause" | "resume" | "start" | "state">>;
type _ApplicationStateIsReadonly = Expect<IsReadonlyKey<Application, "state">>;
type _ApplicationStateIsLifecycleState = Expect<Equal<Application["state"], EnumApplicationState>>;
// 运行期字符串值保留：枚举成员运行期值即对应字面量（"created" 等），
// 与既有 `state === "running"` 比较兼容（string enum 值比较不破裂）
const _applicationStateValuesPreserved: true = (EnumApplicationState.Created === "created" &&
    EnumApplicationState.Initializing === "initializing" &&
    EnumApplicationState.Running === "running" &&
    EnumApplicationState.Paused === "paused" &&
    EnumApplicationState.Stopping === "stopping" &&
    EnumApplicationState.Disposed === "disposed") as true;
type _ApplicationOperationsReturnPromises = Expect<
    Equal<Application["start"], () => Promise<void>> &
        Equal<Application["pause"], () => Promise<void>> &
        Equal<Application["resume"], () => Promise<void>> &
        Equal<Application["dispose"], () => Promise<void>>
>;
type _ApplicationContextHasNoServiceLocator = Expect<NeverKey<IApplicationContext, "get" | "resolve" | "registry" | "container" | "provide">>;
type _ApplicationContextHasNoApplicationIdentity = Expect<NeverKey<IApplicationContext, "application" | "app" | "identity" | "owner">>;

type _ModuleShape = Expect<Equal<keyof IModule, "id" | "dependencies" | LifecycleHookName>>;
type _ModuleIdIsString = Expect<Equal<IModule["id"], string>>;
type _ModuleIdIsReadonly = Expect<IsReadonlyKey<IModule, "id">>;
type _DependenciesAreReadonlyIds = Expect<Equal<IModule["dependencies"], readonly string[]>>;
type _DependenciesDoNotContainModules = Expect<Equal<Extract<IModule["dependencies"][number], IModule>, never>>;
type _ModulePhaseIsClosedUnion = Expect<Equal<keyof typeof EnumModulePhase, "Initialize" | "Start" | "Pause" | "Resume" | "Stop" | "Dispose">>;
type _ModuleRuntimeStateIsClosedUnion = Expect<Equal<keyof typeof EnumModuleRuntimeState, "Registered" | "Initialized" | "Started" | "Paused" | "Stopped" | "Disposed">>;
type _ModuleHasNoManagerPattern = Expect<NeverKey<IModule, "create" | "register" | "configure" | "manager" | "builder">>;
type _ModuleHasNoEventBus = Expect<NeverKey<IModule, "on" | "emit" | "subscribe" | "publish" | "events">>;
type _LifecycleHooksAreOptional = Expect<
    Equal<
        {
            [Hook in LifecycleHookName]: IsOptionalKey<IModule, Hook>;
        }[LifecycleHookName],
        true
    >
>;
type _LifecycleHooksUseApplicationContext = Expect<
    Equal<
        {
            [Hook in LifecycleHookName]: Equal<NonNullable<IModule[Hook]>, ExpectedLifecycleHook>;
        }[LifecycleHookName],
        true
    >
>;

type _LoggerShape = Expect<Equal<keyof ILogger, "debug" | "info" | "warn" | "error" | "child">>;
type _LogLevelIsClosedUnion = Expect<Equal<keyof typeof EnumLogLevel, "Debug" | "Info" | "Warn" | "Error">>;
type _LogContextIsRecord = Expect<Equal<ILogContext, Readonly<Record<string, unknown>>>>;
type _LogRecordShape = Expect<
    Equal<
        ILogRecord,
        Readonly<{
            level: EnumLogLevel;
            message: string;
            timestamp: number;
            scope: string;
            context: ILogContext;
            error?: Error & { readonly cause?: unknown };
        }>
    >
>;

type _PlatformShape = Expect<Equal<keyof IApplicationVisibility, "state" | "onVisibilityChange" | "setVisibility">>;
type _ApplicationVisibilityStateIsClosedUnion = Expect<Equal<keyof typeof EnumApplicationVisibilityState, "Foreground" | "Background">>;
type _ApplicationVisibilityStateIsReadonly = Expect<IsReadonlyKey<IApplicationVisibility, "state">>;
type _PlatformStorageShape = Expect<Equal<keyof IPlatformStorage, "delete" | "get" | "set">>;
type _PlatformStorageReturnsPromises = Expect<
    Equal<IPlatformStorage["get"], (key: string) => Promise<string | null>> &
        Equal<IPlatformStorage["set"], (key: string, value: string) => Promise<void>> &
        Equal<IPlatformStorage["delete"], (key: string) => Promise<void>>
>;
type _DeviceInfoShape = Expect<Equal<keyof IDeviceInfo, "language" | "model" | "platform">>;
type _DeviceInfoIsReadonly = Expect<IsReadonlyKey<IDeviceInfo, "platform"> & IsReadonlyKey<IDeviceInfo, "model"> & IsReadonlyKey<IDeviceInfo, "language">>;
type _TimeSourceShape = Expect<Equal<keyof ITimeSource, "now">>;
type _TimeSourceReturnsNumber = Expect<Equal<ITimeSource["now"], () => number>>;

type TestAction = "jump" | "move";

// branded string：编译期与 string 区分（可经 String() 收窄回 string），运行期即字符串。
// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
type _InputSourceIdIsString = Expect<Equal<IInputSourceId extends String ? true : false, true>>;
// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
type _InputContextIdIsString = Expect<Equal<IInputContextId extends String ? true : false, true>>;
type _InputEventShape = Expect<Equal<keyof IInputEvent, "sourceId" | "pressed" | "value">>;
type _InputEventSourceIdIsReadonly = Expect<IsReadonlyKey<IInputEvent, "sourceId">>;
type _InputEventValueIsOptional = Expect<IsOptionalKey<IInputEvent, "value">>;
type _InputSampleShape = Expect<Equal<keyof IInputSample<TestAction>, "action" | "pressed" | "value" | "timestamp">>;
type _InputSampleActionIsGeneric = Expect<Equal<IInputSample<TestAction>["action"], TestAction>>;
type _InputSampleIsReadonly = Expect<IsReadonlyKey<IInputSample<TestAction>, "action"> & IsReadonlyKey<IInputSample<TestAction>, "pressed"> & IsReadonlyKey<IInputSample<TestAction>, "value">>;
type _InputMappingIsRecordOfActions = Expect<Equal<IInputMapping<TestAction>, Readonly<Record<string, TestAction>>>>;
type _InputSourceShape = Expect<Equal<keyof IInputSource, "id" | "subscribe">>;
type _InputSourceSubscribeReturnsUnsubscribe = Expect<Equal<IInputSource["subscribe"], (listener: (event: IInputEvent) => void) => () => void>>;

type _InputMapperShape = Expect<Equal<keyof InputMapper<TestAction>, "activeContext" | "setMappings" | "setActiveContext" | "replaceSource" | "dispose">>;
type _InputMapperActiveContextIsReadonly = Expect<IsReadonlyKey<InputMapper<TestAction>, "activeContext">>;
type _InputMapperSetMappingsIsTyped = Expect<Equal<InputMapper<TestAction>["setMappings"], (mappings: Readonly<Record<string, IInputMapping<TestAction>>>) => void>>;
type _InputMapperReplaceSourceIsTyped = Expect<Equal<InputMapper<TestAction>["replaceSource"], (source: IInputSource) => void>>;
type _InputMapperDisposeIsVoid = Expect<Equal<InputMapper<TestAction>["dispose"], () => void>>;
type _InputMapperOptionsNavigatorIsOptional = Expect<IsOptionalKey<InputMapperOptions<TestAction>, "navigator">>;
type _InputMapperOptionsIsBlockedIsOptional = Expect<IsOptionalKey<InputMapperOptions<TestAction>, "isBlocked">>;

type ScopedEvents = {
    readonly scoreChanged: { readonly score: number };
};

type _ScopedEventChannelShape = Expect<Equal<keyof ScopedEventChannel<ScopedEvents>, "dispose" | "emit" | "on">>;
type _ScopedEventChannelOnReturnsDisposeHandle = Expect<
    Equal<ScopedEventChannel<ScopedEvents>["on"], <EventName extends keyof ScopedEvents>(event: EventName, handler: (payload: ScopedEvents[EventName]) => void) => DisposeHandle>
>;
type _ScopedEventChannelEmitIsTyped = Expect<Equal<ScopedEventChannel<ScopedEvents>["emit"], <EventName extends keyof ScopedEvents>(event: EventName, payload: ScopedEvents[EventName]) => void>>;

// branded string：编译期与 string 区分，键空间在快照中回退为普通 string（Record 键要求）
// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
type _ConfigKeyIsString = Expect<Equal<IConfigKey extends String ? true : false, true>>;

type _ConfigTableShape = Expect<Equal<keyof IConfigTable, "read" | "snapshot">>;
type _ConfigTableReadIsOverloadedWithDefault = Expect<
    Equal<
        IConfigTable["read"],
        {
            <T>(key: IConfigKey, type: IConfigReadType<T>): T;
            <T>(key: IConfigKey, type: IConfigReadType<T>, defaultValue: T): T;
        }
    >
>;
type _ConfigReadTypeParsesUnknownToDeclared = Expect<Equal<IConfigReadType<number>["parse"], (key: IConfigKey, raw: unknown) => number>>;
type _ConfigTableSnapshotReturnsReadonly = Expect<Equal<IConfigTable["snapshot"], () => IReadonlyConfigSnapshot>>;

type _FuiComponentUrlIsTemplateLiteral = Expect<Equal<FuiComponentUrl, `ui://${string}/${string}`>>;
type _FuiBindOptionsHasSingleRequiredKey = Expect<Equal<keyof FuiBindOptions, "runtimeBinding">> & Expect<Equal<FuiBindOptions["runtimeBinding"], "required" | "none">>;
type _EntryCarriesRuntimeBinding = Expect<Equal<FuiComponentEntry["runtimeBinding"], "required" | "none">>;
type _RegistryUrlIsBranded = Expect<Equal<Parameters<FuiComponentRegistry["register"]>[0], FuiComponentUrl> & Equal<Parameters<FuiComponentRegistry["lookup"]>[0], FuiComponentUrl>>;

class _FuiTypecheckView extends FuiView<unknown, unknown> {
    protected onConstruct(): void {}
    protected onState(): void {}
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
