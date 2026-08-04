import type { DisposeHandle } from "../scheduling/DisposeHandle";

export type StateHook<State extends string, Event extends string> = (
  from: State,
  event: Event,
  to: State,
) => void;

export type StateTransitionTable<State extends string, Event extends string> = {
  readonly [from in State]?: { readonly [event in Event]?: State };
};

export interface StateMachineHooks<State extends string, Event extends string> {
  readonly onExit?: { readonly [state in State]?: StateHook<State, Event> };
  readonly onEnter?: { readonly [state in State]?: StateHook<State, Event> };
}

export interface StateMachineOptions<State extends string, Event extends string> {
  readonly initial: State;
  readonly transitions: StateTransitionTable<State, Event>;
  readonly hooks?: StateMachineHooks<State, Event>;
  readonly onTransitionError?: (error: unknown) => void;
}

export interface StateMachine<State extends string, Event extends string> {
  readonly state: State;
  send(event: Event): void;
  reset(): void;
  dispose(): DisposeHandle;
}

const NOOP_HANDLE: DisposeHandle = {
  dispose: () => {},
};

export function createStateMachine<State extends string, Event extends string>(
  options: StateMachineOptions<State, Event>,
): StateMachine<State, Event> {
  const { initial, transitions, hooks } = options;
  const reportFailure =
    options.onTransitionError ?? ((error: unknown) => console.error(error));

  let current: State = initial;
  let disposed = false;
  let inTransition = false;

  function report(error: unknown): void {
    try {
      reportFailure(error);
    } catch (reporterError) {
      console.error(reporterError);
    }
  }

  function send(event: Event): void {
    if (disposed) {
      return;
    }

    if (inTransition) {
      report(
        new Error(
          `StateMachine rejected reentrant event "${String(event)}" from state "${String(current)}"`,
        ),
      );
      return;
    }

    const from = current;
    const eventTransitions = transitions[from];

    if (
      eventTransitions === undefined ||
      eventTransitions[event] === undefined
    ) {
      report(
        new Error(
          `StateMachine rejected event "${String(event)}" from state "${String(from)}"`,
        ),
      );
      return;
    }

    const to = eventTransitions[event];

    inTransition = true;
    let switched = false;

    try {
      const exitHook = hooks?.onExit?.[from];
      if (exitHook !== undefined) {
        exitHook(from, event, to);
      }

      current = to;
      switched = true;

      const enterHook = hooks?.onEnter?.[to];
      if (enterHook !== undefined) {
        enterHook(from, event, to);
      }
    } catch (error) {
      if (switched) {
        current = from;
      }
      report(error);
    } finally {
      inTransition = false;
    }
  }

  function reset(): void {
    if (disposed) {
      return;
    }

    current = initial;
  }

  /**
   * Disposal takes effect immediately: the machine stops accepting events.
   * The returned handle only serves the uniform DisposeHandle shape and
   * idempotent confirmation; unlike scheduler or event-channel handles it
   * does not delay or repeat the disposal.
   */
  function dispose(): DisposeHandle {
    if (disposed) {
      return NOOP_HANDLE;
    }

    disposed = true;

    return NOOP_HANDLE;
  }

  return {
    get state(): State {
      return current;
    },
    send,
    reset,
    dispose,
  };
}
