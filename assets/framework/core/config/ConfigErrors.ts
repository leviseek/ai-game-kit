import { FrameworkError } from "../errors/FrameworkError";
import type { IConfigKey } from "../../contracts/interfaces/IConfigKey";

/** 读取不存在的配置键时的类型化错误，携带键名。 */
export class ConfigMissingError extends FrameworkError {
    readonly key: IConfigKey;

    constructor(key: IConfigKey) {
        super(`Config key "${key}" is missing`, { component: "config" });

        this.name = "ConfigMissingError";
        this.key = key;
    }
}

/** 配置值形状与声明类型不符时的类型化错误，携带键名与期望形状。 */
export class ConfigTypeMismatchError extends FrameworkError {
    readonly key: IConfigKey;
    readonly expected: string;

    constructor(key: IConfigKey, expected: string) {
        super(`Config key "${key}" does not match declared type ${expected}`, {
            component: "config",
        });

        this.name = "ConfigTypeMismatchError";
        this.key = key;
        this.expected = expected;
    }
}

/** 配置内容无法按期望解析时的类型化错误，携带键名与诊断信息。 */
export class ConfigParseError extends FrameworkError {
    readonly key: IConfigKey;
    readonly detail: string;

    constructor(key: IConfigKey, detail: string, options?: { readonly cause?: unknown }) {
        super(`Config key "${key}" could not be parsed: ${detail}`, {
            component: "config",
            cause: options?.cause,
        });

        this.name = "ConfigParseError";
        this.key = key;
        this.detail = detail;
    }
}

/** 配置 Bundle/资源装载失败时的类型化错误，携带 bundle、路径与底层原因。 */
export class ConfigLoadError extends FrameworkError {
    readonly bundle: string;
    readonly path: string;

    constructor(bundle: string, path: string, options?: { readonly cause?: unknown }) {
        super(`Failed to load config "${bundle}:${path}"`, {
            component: "config",
            cause: options?.cause,
        });

        this.name = "ConfigLoadError";
        this.bundle = bundle;
        this.path = path;
    }
}
