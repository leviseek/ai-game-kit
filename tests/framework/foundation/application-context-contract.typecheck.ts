import type { Logger } from "../../../assets/framework/contracts/logging/Logger";
import type { ApplicationContext, ApplicationLifecycle, ApplicationState } from "../../../assets/framework/contracts/application/ApplicationContext";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;

type Expect<Type extends true> = Type;

type IsReadonlyKey<Type, Key extends keyof Type> = Equal<Pick<Type, Key>, Readonly<Pick<Type, Key>>>;

type NeverKey<Type, Key extends string> = Equal<Extract<keyof Type, Key>, never>;

type _ApplicationContextShape = Expect<Equal<keyof ApplicationContext, "logger" | "state">>;
type _ApplicationContextLoggerIsLogger = Expect<Equal<ApplicationContext["logger"], Logger>>;
type _ApplicationContextStateIsLifecycleState = Expect<Equal<ApplicationContext["state"], ApplicationState>>;
type _ApplicationContextStateIsReadonly = Expect<IsReadonlyKey<ApplicationContext, "state">>;

type _ApplicationLifecycleShape = Expect<Equal<keyof ApplicationLifecycle, "state">>;
type _ApplicationLifecycleStateIsReadonly = Expect<IsReadonlyKey<ApplicationLifecycle, "state">>;

type _ApplicationContextHasNoToken = Expect<NeverKey<ApplicationContext, "token">>;
type _ApplicationContextHasNoServiceLocator = Expect<NeverKey<ApplicationContext, "get" | "resolve" | "registry" | "container" | "provide">>;
type _ApplicationContextHasNoGenericGet = Expect<NeverKey<ApplicationContext, "get">>;
