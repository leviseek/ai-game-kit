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

export function isRecoverableError(error: unknown): boolean {
  return error instanceof FrameworkError && error.recoverable;
}
