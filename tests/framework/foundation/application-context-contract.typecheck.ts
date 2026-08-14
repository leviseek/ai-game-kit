import type { ILogger } from "../../../assets/framework/contracts/interfaces/ILogger";
import type { IApplicationContext } from "../../../assets/framework/contracts/interfaces/IApplicationContext";
import type { IApplicationLifecycle } from "../../../assets/framework/contracts/interfaces/IApplicationLifecycle";
import type { EnumApplicationState } from "../../../assets/framework/contracts/enums/EnumApplicationState";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;

type Expect<Type extends true> = Type;

type IsReadonlyKey<Type, Key extends keyof Type> = Equal<Pick<Type, Key>, Readonly<Pick<Type, Key>>>;

type NeverKey<Type, Key extends string> = Equal<Extract<keyof Type, Key>, never>;

type _ApplicationContextShape = Expect<Equal<keyof IApplicationContext, "logger" | "state">>;
type _ApplicationContextLoggerIsLogger = Expect<Equal<IApplicationContext["logger"], ILogger>>;
type _ApplicationContextStateIsLifecycleState = Expect<Equal<IApplicationContext["state"], EnumApplicationState>>;
type _ApplicationContextStateIsReadonly = Expect<IsReadonlyKey<IApplicationContext, "state">>;

type _ApplicationLifecycleShape = Expect<Equal<keyof IApplicationLifecycle, "state">>;
type _ApplicationLifecycleStateIsReadonly = Expect<IsReadonlyKey<IApplicationLifecycle, "state">>;

type _ApplicationContextHasNoToken = Expect<NeverKey<IApplicationContext, "token">>;
type _ApplicationContextHasNoServiceLocator = Expect<NeverKey<IApplicationContext, "get" | "resolve" | "registry" | "container" | "provide">>;
type _ApplicationContextHasNoGenericGet = Expect<NeverKey<IApplicationContext, "get">>;
