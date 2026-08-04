export interface FrameworkErrorOptions {
  readonly cause?: unknown;
  readonly moduleId?: string;
  readonly phase?: string;
  readonly component?: string;
  readonly recoverable?: boolean;
}

type ErrorConstructorWithCause = new (
  message?: string,
  options?: { readonly cause?: unknown },
) => Error;

const ErrorWithCause = Error as ErrorConstructorWithCause;

export class FrameworkError extends ErrorWithCause {
  readonly recoverable: boolean;
  readonly moduleId?: string;
  readonly phase?: string;
  readonly component?: string;

  constructor(message: string, options: FrameworkErrorOptions = {}) {
    super(message, { cause: options.cause });

    this.name = "FrameworkError";
    this.recoverable = options.recoverable ?? false;
    this.moduleId = options.moduleId;
    this.phase = options.phase;
    this.component = options.component;
  }
}

/**
 * 按错误自身的显式 FrameworkError 分类判断其是否可恢复。只检查顶层错误：
 * 被包装的框架错误（如 `new Error("wrapped", { cause: recoverableError })`）
 * 不会被解包，因此调用方需自行解包 `cause` 后再判断。
 */
export function isRecoverableError(error: unknown): boolean {
  return error instanceof FrameworkError && error.recoverable;
}
