/**
 * 框架公开 API 白名单：仅 re-export 稳定契约类型与核心工厂/类，
 * 是业务代码的推荐导入入口；内部实现经此隔离，不直接深层导入。
 */
export type { ILogContext } from "./contracts/interfaces/ILogContext";
export type { ILogger } from "./contracts/interfaces/ILogger";
export type { ILogRecord } from "./contracts/interfaces/ILogRecord";
export { EnumLogLevel } from "./contracts/enums/EnumLogLevel";

export type { IApplicationContext } from "./contracts/interfaces/IApplicationContext";
export type { IApplicationLifecycle } from "./contracts/interfaces/IApplicationLifecycle";
export { EnumApplicationState } from "./contracts/enums/EnumApplicationState";

export type { IModule } from "./contracts/interfaces/IModule";
export { EnumModulePhase } from "./contracts/enums/EnumModulePhase";
export { EnumModuleRuntimeState } from "./contracts/enums/EnumModuleRuntimeState";

export type { IApplicationVisibility } from "./contracts/interfaces/IApplicationVisibility";
export type { IDeviceInfo } from "./contracts/interfaces/IDeviceInfo";
export type { IPlatformStorage } from "./contracts/interfaces/IPlatformStorage";
export { EnumApplicationVisibilityState } from "./contracts/enums/EnumApplicationVisibilityState";

export type { ITimeSource } from "./contracts/interfaces/ITimeSource";

export type { IAction } from "./contracts/interfaces/IAction";
export type { IStore } from "./contracts/interfaces/IStore";
export type { IStoreListener } from "./contracts/interfaces/IStoreListener";
export { createStore } from "./core/state/Store";

export type { ISaveLoadResult } from "./contracts/interfaces/ISaveLoadResult";
export type { ISaveMigrator } from "./contracts/interfaces/ISaveMigrator";
export type { ISaveVersion } from "./contracts/interfaces/ISaveVersion";
export type { IVersionedStorage } from "./contracts/interfaces/IVersionedStorage";
export type { IVersionedStorageOptions } from "./contracts/interfaces/IVersionedStorageOptions";
export { SaveCorruptionError, SaveMigrationError, SaveSerializationError, SaveVersionError, createVersionedStorage } from "./core/storage/VersionedStorage";

export type { DisposeHandle } from "./core/scheduling/DisposeHandle";

export { PassiveScheduler } from "./core/scheduling/PassiveScheduler";
export type { PassiveSchedulerOptions, ScheduleOptions } from "./core/scheduling/PassiveScheduler";

export type { FrameworkErrorOptions } from "./core/errors/FrameworkError";
export { FrameworkError, isRecoverableError } from "./core/errors/FrameworkError";

export type { EventMap, ScopedEventChannel, ScopedEventChannelOptions } from "./core/events/ScopedEventChannel";
export { createScopedEventChannel } from "./core/events/ScopedEventChannel";

export type { StateHook, StateMachine, StateMachineHooks, StateMachineOptions, StateTransitionTable } from "./core/fsm/StateMachine";
export { createStateMachine } from "./core/fsm/StateMachine";

export type { ObjectPool, ObjectPoolOptions } from "./core/pooling/ObjectPool";
export { createObjectPool } from "./core/pooling/ObjectPool";

export type { ServiceRegistry, ServiceToken } from "./core/services/ServiceRegistry";
export { ServiceRegistrationError, ServiceResolutionError, createServiceRegistry, createServiceToken } from "./core/services/ServiceRegistry";

export { Application } from "./application/Application";
export { ApplicationStateError } from "./application/ApplicationStateError";
export { createApplicationContext } from "./application/ApplicationContext";
export { createGameFixture } from "./application/GameFixture";
export type { GameFixture, GameFixtureOptions } from "./application/GameFixture";
export { ModuleLifecycleError } from "./application/ModuleLifecycleError";

export type { IResourceHandle } from "./contracts/interfaces/IResourceHandle";
export type { IResourceKey } from "./contracts/interfaces/IResourceKey";
export { EnumResourceKind } from "./contracts/enums/EnumResourceKind";
export { EnumResourceLoadState } from "./contracts/enums/EnumResourceLoadState";

export type { IResourceScope } from "./contracts/interfaces/IResourceScope";

export type { IResourceProvider } from "./contracts/interfaces/IResourceProvider";
export type { IResourceProviderOptions } from "./contracts/interfaces/IResourceProviderOptions";

export { createResourceProvider } from "./core/resource/ResourceProvider";

export type { SceneFlow, SceneFlowOptions, SceneFlowState, SceneResources, SceneSwitchResult } from "./core/scene/SceneFlow";
export { createSceneFlow } from "./core/scene/SceneFlow";

export type { IUiPage } from "./contracts/interfaces/IUiPage";
export type { IUiResult } from "./contracts/interfaces/IUiResult";
export { EnumDuplicateOpenPolicy } from "./contracts/enums/EnumDuplicateOpenPolicy";
export { EnumUiLayer } from "./contracts/enums/EnumUiLayer";
export { UI_LAYER_ORDER } from "./contracts/constants/UiLayer";

export type { Binding } from "./contracts/interfaces/Binding";
export type { IBindable } from "./contracts/interfaces/IBindable";
export type { ICommandBinding } from "./contracts/interfaces/ICommandBinding";
export type { IEnabledBinding } from "./contracts/interfaces/IEnabledBinding";
export type { IPositionBinding } from "./contracts/interfaces/IPositionBinding";
export type { IProgressBinding } from "./contracts/interfaces/IProgressBinding";
export type { ITextBinding } from "./contracts/interfaces/ITextBinding";
export type { IViewModelNode } from "./contracts/interfaces/IViewModelNode";
export type { IVisibleBinding } from "./contracts/interfaces/IVisibleBinding";

export type { IFairyGuiListItemView } from "./contracts/interfaces/IFairyGuiListItemView";
export type { IFairyGuiListHandle } from "./contracts/interfaces/IFairyGuiListHandle";

export type { ITypedButtonNode } from "./contracts/interfaces/ITypedButtonNode";
export type { ITypedComponentNode } from "./contracts/interfaces/ITypedComponentNode";
export type { ITypedImageNode } from "./contracts/interfaces/ITypedImageNode";
export type { ITypedInputNode } from "./contracts/interfaces/ITypedInputNode";
export type { ITypedListNode } from "./contracts/interfaces/ITypedListNode";
export type { ITypedNode } from "./contracts/interfaces/ITypedNode";
export type { ITypedProgressNode } from "./contracts/interfaces/ITypedProgressNode";
export type { ITypedTextNode } from "./contracts/interfaces/ITypedTextNode";

export type { IFuiClickMeta } from "./contracts/interfaces/IFuiClickMeta";
export type { IFuiView } from "./contracts/interfaces/IFuiView";
export type { IFuiViewSeam } from "./contracts/interfaces/IFuiViewSeam";
export { FuiView } from "./core/fui/FuiView";

export { FUIBind, FClick } from "./core/fui/FuiBindings";
export type { FuiBindOptions } from "./core/fui/FuiBindings";
export type { FuiComponentEntry, FuiComponentRegistry, FuiComponentUrl } from "./core/fui/FuiComponentRegistry";
export { getFuiComponentRegistry } from "./core/fui/FuiComponentRegistry";
export { FuiComponentRegistrationError, FuiViewCleanupError } from "./core/fui/FuiErrors";

export type { FuiViewBinding, FuiViewBindingRegistrar, FuiViewBindingScope } from "./core/fui/FuiViewBinderRegistry";
export { defineFuiViewBinding } from "./core/fui/FuiViewBinderRegistry";

export type { ViewModelRenderer, ViewModelRendererOptions } from "./core/ui/ViewModelRenderer";
export { createBindable, createViewModelRenderer } from "./core/ui/ViewModelRenderer";

export type { UiNavigator, UiNavigatorOptions } from "./core/ui/UiNavigator";
export { createUiNavigator } from "./core/ui/UiNavigator";

export type { IInputContextId } from "./contracts/interfaces/IInputContextId";
export type { IInputEvent } from "./contracts/interfaces/IInputEvent";
export type { IInputMapping } from "./contracts/interfaces/IInputMapping";
export type { IInputSample } from "./contracts/interfaces/IInputSample";
export type { IInputSource } from "./contracts/interfaces/IInputSource";
export type { IInputSourceId } from "./contracts/interfaces/IInputSourceId";

export type { InputMapper, InputMapperOptions } from "./core/input/InputMapper";
export { createInputMapper } from "./core/input/InputMapper";

export type { IConfigKey } from "./contracts/interfaces/IConfigKey";
export type { IConfigReadType } from "./contracts/interfaces/IConfigReadType";
export type { IConfigTable } from "./contracts/interfaces/IConfigTable";
export type { IReadonlyConfigSnapshot } from "./contracts/interfaces/IReadonlyConfigSnapshot";

export { ConfigLoadError, ConfigMissingError, ConfigParseError, ConfigTypeMismatchError } from "./core/config/ConfigErrors";

export { configArray, configBoolean, configNumber, configObject, configString, createConfigTable } from "./core/config/ConfigTable";

export { loadConfigTable } from "./core/config/ConfigLoader";

export type { IAudioBackend } from "./contracts/interfaces/IAudioBackend";
export type { IAudioBackgroundPolicy } from "./contracts/interfaces/IAudioBackgroundPolicy";
export type { IAudioGroupState } from "./contracts/interfaces/IAudioGroupState";
export type { IAudioPlayScope } from "./contracts/interfaces/IAudioPlayScope";
export type { IAudioService } from "./contracts/interfaces/IAudioService";
export type { IAudioServiceOptions } from "./contracts/interfaces/IAudioServiceOptions";
export type { IAudioTrackRef } from "./contracts/interfaces/IAudioTrackRef";
export { EnumAudioGroup } from "./contracts/enums/EnumAudioGroup";
export { createAudioService } from "./core/audio/AudioService";

export type { BundleModuleRegistry } from "./core/module/BundleModuleRegistry";
export { getBundleModuleRegistry, registerBundle, lookupBundle } from "./core/module/BundleModuleRegistry";

export { EnumPauseDomain } from "./contracts/enums/EnumPauseDomain";
export { GameClock } from "./core/time/GameClock";
export type { IMotionTweenOptions } from "./contracts/interfaces/IMotionTweenOptions";

export { SimulationClock } from "./core/time/SimulationClock";
export type { SimulationClockOptions } from "./core/time/SimulationClock";
export { WallClock } from "./core/time/WallClock";
export { createMotionTween, easeOutCubic, easeOutQuad } from "./core/time/MotionTween";
export type { EaseCurve, MotionTween, MotionTweenRuntimeOptions } from "./core/time/MotionTween";
