import type { DisposeHandle } from "../scheduling/DisposeHandle";

export interface EventMap {
    readonly [eventName: string]: unknown;
}

export interface ScopedEventChannelOptions {
    readonly onHandlerError?: (error: unknown) => void;
}

export interface ScopedEventChannel<Events extends EventMap> {
    /**
     * 订阅事件，返回可单独退订的句柄；通道释放后调用会抛错。
     * handler 抛出的异常被捕获后交给 onHandlerError（失败隔离，不中断同事件其他 handler）。
     */
    on<EventName extends keyof Events>(
        event: EventName,
        handler: (payload: Events[EventName]) => void,
    ): DisposeHandle;
    /**
     * 发布事件；通道释放后静默返回。handler 在发布中调用退订是安全的。
     */
    emit<EventName extends keyof Events>(
        event: EventName,
        payload: Events[EventName],
    ): void;
    dispose(): void;
}

interface HandlerEntry {
    readonly handler: (payload: unknown) => void;
    cancelled: boolean;
}

export function createScopedEventChannel<Events extends EventMap>(
    options: ScopedEventChannelOptions = {},
): ScopedEventChannel<Events> {
    const onHandlerError =
        options.onHandlerError ?? ((error: unknown) => console.error(error));
    const handlersByEvent = new Map<string, HandlerEntry[]>();
    let disposed = false;

    return {
        on: (event, handler) => {
            if (disposed) {
                throw new Error(
                    "ScopedEventChannel cannot subscribe after disposal",
                );
            }

            const entries = handlersByEvent.get(event as string);
            const entry: HandlerEntry = {
                handler: handler as (payload: unknown) => void,
                cancelled: false,
            };

            if (entries === undefined) {
                handlersByEvent.set(event as string, [entry]);
            } else {
                entries.push(entry);
            }

            return {
                dispose: () => {
                    // 置 cancelled 后立即 splice，并在数组清空时移除 Map key，保持 handlersByEvent 干净。
                    entry.cancelled = true;

                    const currentEntries = handlersByEvent.get(event as string);

                    if (currentEntries === undefined) {
                        return;
                    }

                    const index = currentEntries.indexOf(entry);

                    if (index !== -1) {
                        currentEntries.splice(index, 1);
                    }

                    if (currentEntries.length === 0) {
                        handlersByEvent.delete(event as string);
                    }
                },
            };
        },

        emit: (event, payload) => {
            if (disposed) {
                return;
            }

            const entries = handlersByEvent.get(event as string);

            if (entries === undefined) {
                return;
            }

            // 拷贝快照遍历：handler 内可能调用退订（修改原数组），用快照 + cancelled 标记
            // 保证迭代中安全移除。
            for (const entry of [...entries]) {
                if (disposed) {
                    return;
                }

                if (entry.cancelled) {
                    continue;
                }

                try {
                    entry.handler(payload);
                } catch (error) {
                    try {
                        onHandlerError(error);
                    } catch (reporterError) {
                        console.error(reporterError);
                    }
                }
            }

            pruneEntries(event as string, entries);
        },

        dispose: () => {
            disposed = true;
            handlersByEvent.clear();
        },
    };

    function pruneEntries(event: string, entries: HandlerEntry[]): void {
        const active = entries.filter((entry) => !entry.cancelled);

        if (active.length === 0) {
            handlersByEvent.delete(event);
        } else if (active.length !== entries.length) {
            handlersByEvent.set(event, active);
        }
    }
}
