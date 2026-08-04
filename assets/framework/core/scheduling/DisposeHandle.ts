/**
 * 释放句柄：调用 dispose() 释放订阅/任务。实现约定为幂等（idempotent），
 * 可安全重复调用。
 */
export interface DisposeHandle {
  dispose(): void;
}
