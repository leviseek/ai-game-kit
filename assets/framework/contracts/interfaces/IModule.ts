import type { IApplicationContext } from "./IApplicationContext";

/**
 * 模块契约：业务模块只依赖本接口与 IApplicationContext，phase 方法可选、
 * 由框架按序调用。实现不应依赖 Cocos 或应用层具体类型。
 */
export interface IModule {
    readonly id: string;
    readonly dependencies: readonly string[];

    initialize?(context: IApplicationContext): void | Promise<void>;
    start?(context: IApplicationContext): void | Promise<void>;
    pause?(context: IApplicationContext): void | Promise<void>;
    resume?(context: IApplicationContext): void | Promise<void>;
    stop?(context: IApplicationContext): void | Promise<void>;
    dispose?(context: IApplicationContext): void | Promise<void>;
}
