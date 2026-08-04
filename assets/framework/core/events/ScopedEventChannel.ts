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
