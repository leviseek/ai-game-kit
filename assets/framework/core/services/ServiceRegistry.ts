// 服务注册表：组合根以类型化 token 注册/解析服务的最小实现。
// 本文件只锁定 token 与注册表契约形状（任务 1.2）；register/resolve 等
// 行为实现与类型化错误在后续任务完成，当前仅提供满足契约的占位。
declare const serviceTokenBrand: unique symbol;

export interface ServiceToken<T> {
  readonly description: string;
  // brand 仅参与编译期结构判别，使不同服务类型的 token 不可互换；运行期不携带该键值。
  readonly [serviceTokenBrand]: T;
}

export function createServiceToken<T>(description: string): ServiceToken<T> {
  // 运行期 token 只需 description；brand 键由编译期类型系统保证唯一性。
  return { description } as unknown as ServiceToken<T>;
}

export interface ServiceRegistry {
  register<T>(token: ServiceToken<T>, instance: T): void;
  registerFactory<T>(
    token: ServiceToken<T>,
    factory: (resolve: <U>(token: ServiceToken<U>) => U) => T,
  ): void;
  resolve<T>(token: ServiceToken<T>): T;
  isRegistered<T>(token: ServiceToken<T>): boolean;
}
