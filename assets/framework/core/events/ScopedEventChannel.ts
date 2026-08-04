import type { DisposeHandle } from "../scheduling/DisposeHandle";

export interface EventMap {
  readonly [eventName: string]: unknown;
}

export interface ScopedEventChannelOptions {
  readonly onHandlerError?: (error: unknown) => void;
}

export interface ScopedEventChannel<Events extends EventMap> {
  on<EventName extends keyof Events>(
    event: EventName,
    handler: (payload: Events[EventName]) => void,
  ): DisposeHandle;
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
          entry.cancelled = true;
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

      for (const entry of [...entries]) {
        if (entry.cancelled) {
          continue;
        }

        try {
          entry.handler(payload);
        } catch (error) {
          onHandlerError(error);
        }
      }
    },

    dispose: () => {
      disposed = true;
      handlersByEvent.clear();
    },
  };
}
