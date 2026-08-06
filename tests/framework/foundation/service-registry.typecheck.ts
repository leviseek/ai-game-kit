import type {
  ServiceRegistry,
  ServiceToken,
} from "../../../assets/framework/core/services/ServiceRegistry";
import { createServiceToken } from "../../../assets/framework/core/services/ServiceRegistry";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;

type Expect<Type extends true> = Type;

interface AudioService {
  readonly play: () => void;
}

interface LoggerService {
  readonly log: (message: string) => void;
}

const audioToken = createServiceToken<AudioService>("audio");
const loggerToken = createServiceToken<LoggerService>("logger");

type _TokenTypeIsGenericBound = Expect<
  Equal<typeof audioToken, ServiceToken<AudioService>>
>;
type _TokenDescriptionIsString = Expect<
  Equal<ServiceToken<AudioService>["description"], string>
>;
type _DifferentServiceTypesYieldDistinctTokens = Expect<
  Equal<
    Equal<ServiceToken<AudioService>, ServiceToken<LoggerService>>,
    false
  >
>;

// 类型不匹配必须编译期被拒：token 绑定唯一服务类型，不能赋值给另一类型 token。
// @ts-expect-error ServiceToken<AudioService> 不能赋值给 ServiceToken<LoggerService>
const wrongAssignment: ServiceToken<LoggerService> = audioToken;

// 注册与解析保持类型一致：注册后的服务按同一 token 解析回同一静态类型。
// 只在类型层面对契约做断言，不依赖运行时工厂（工厂实现属于后续任务）。
declare const registry: ServiceRegistry;

registry.register(audioToken, { play: () => {} });
// @ts-expect-error 注册类型与 token 绑定类型不一致必须被拒绝
registry.register(audioToken, { log: () => {} });

const resolvedAudio = registry.resolve(audioToken);
type _ResolvedTypeMatchesToken = Expect<Equal<typeof resolvedAudio, AudioService>>;
