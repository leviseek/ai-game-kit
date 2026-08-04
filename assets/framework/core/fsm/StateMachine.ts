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

    const exitHook = hooks?.onExit?.[from];
    if (exitHook !== undefined) {
      try {
        exitHook(from, event, to);
      } catch (error) {
        report(error);
        return;
      }
    }

    current = to;

    const enterHook = hooks?.onEnter?.[to];
    if (enterHook !== undefined) {
      try {
        enterHook(from, event, to);
      } catch (error) {
        current = from;
        report(error);
        return;
      }
    }
  }

  function reset(): void {
    if (disposed) {
      return;
    }

    current = initial;
  }

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
