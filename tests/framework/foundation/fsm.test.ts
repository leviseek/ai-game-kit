import { describe, expect, test } from "bun:test";

import type { DisposeHandle } from "../../../assets/framework/core/scheduling/DisposeHandle";
import {
  createStateMachine,
  type StateMachine,
  type StateTransitionTable,
} from "../../../assets/framework/core/fsm/StateMachine";

type DoorState = "closed" | "open" | "locked";
type DoorEvent = "open" | "close" | "lock" | "unlock";

const DOOR_TRANSITIONS: StateTransitionTable<DoorState, DoorEvent> = {
  closed: { open: "open", lock: "locked" },
  open: { close: "closed" },
  locked: { unlock: "closed" },
};

interface Failure {
  readonly error: Error;
}

function createFailures(): {
  readonly failures: Failure[];
  readonly onTransitionError: (error: unknown) => void;
} {
  const failures: Failure[] = [];

  return {
    failures,
    onTransitionError: (error) => {
      failures.push({ error: error as Error });
    },
  };
}

describe("StateMachine legal transitions", () => {
  test("exposes the initial state on creation", () => {
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
    });

    expect(machine.state).toBe("closed");
  });

  test("sending an allowed event advances state", () => {
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
    });

    machine.send("open");
    expect(machine.state).toBe("open");

    machine.send("close");
    expect(machine.state).toBe("closed");
  });

  test("follows the full declared path", () => {
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
    });

    machine.send("lock");
    expect(machine.state).toBe("locked");

    machine.send("unlock");
    expect(machine.state).toBe("closed");
  });
});

describe("StateMachine disallowed transitions", () => {
  test("rejects an event not allowed from the current state and keeps state", () => {
    const { failures, onTransitionError } = createFailures();
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
      onTransitionError,
    });

    machine.send("close");

    expect(machine.state).toBe("closed");
    expect(failures).toHaveLength(1);
    expect(failures[0].error).toBeInstanceOf(Error);
    expect(failures[0].error.message.length).toBeGreaterThan(0);
  });

  test("machine remains usable after a disallowed event", () => {
    const { onTransitionError } = createFailures();
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
      onTransitionError,
    });

    machine.send("close");
    machine.send("open");

    expect(machine.state).toBe("open");
  });
});

describe("StateMachine unknown events", () => {
  test("an event not declared in the table keeps state unchanged and reports failure", () => {
    const { failures, onTransitionError } = createFailures();
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
      onTransitionError,
    });

    machine.send("buzz" as DoorEvent);

    expect(machine.state).toBe("closed");
    expect(failures).toHaveLength(1);
    expect(failures[0].error).toBeInstanceOf(Error);
  });

  test("machine remains usable after an unknown event", () => {
    const { onTransitionError } = createFailures();
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
      onTransitionError,
    });

    machine.send("buzz" as DoorEvent);
    machine.send("open");

    expect(machine.state).toBe("open");
  });
});

describe("StateMachine transition hooks", () => {
  test("exit hook of the source state runs before the enter hook of the target state", () => {
    const order: string[] = [];
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
      hooks: {
        onExit: {
          closed: (from, event, to) => {
            order.push(`exit:${from}`);
            expect(event).toBe("open");
            expect(to).toBe("open");
          },
        },
        onEnter: {
          open: (from, event, to) => {
            order.push(`enter:${to}`);
            expect(from).toBe("closed");
            expect(event).toBe("open");
          },
        },
      },
    });

    machine.send("open");

    expect(order).toEqual(["exit:closed", "enter:open"]);
  });

  test("hooks receive the full transition context", () => {
    const seen: Array<{ readonly from: DoorState; readonly event: DoorEvent; readonly to: DoorState }> = [];
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
      hooks: {
        onExit: {
          closed: (from, event, to) => {
            seen.push({ from, event, to });
          },
        },
        onEnter: {
          open: (from, event, to) => {
            seen.push({ from, event, to });
          },
        },
      },
    });

    machine.send("open");

    expect(seen).toEqual([
      { from: "closed", event: "open", to: "open" },
      { from: "closed", event: "open", to: "open" },
    ]);
  });
});

describe("StateMachine hook failure rollback", () => {
  test("a failing exit hook prevents the enter hook and keeps the original state", () => {
    const { failures, onTransitionError } = createFailures();
    const order: string[] = [];
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
      onTransitionError,
      hooks: {
        onExit: {
          closed: () => {
            order.push("exit:closed");
            throw new Error("exit failed");
          },
        },
        onEnter: {
          open: () => {
            order.push("enter:open");
          },
        },
      },
    });

    machine.send("open");

    expect(order).toEqual(["exit:closed"]);
    expect(failures).toHaveLength(1);
    expect(failures[0].error.message).toBe("exit failed");
    expect(machine.state).toBe("closed");
  });

  test("a failing enter hook rolls the state back to the source state", () => {
    const { failures, onTransitionError } = createFailures();
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
      onTransitionError,
      hooks: {
        onEnter: {
          open: () => {
            throw new Error("enter failed");
          },
        },
      },
    });

    machine.send("open");

    expect(machine.state).toBe("closed");
    expect(failures).toHaveLength(1);
    expect(failures[0].error.message).toBe("enter failed");
  });

  test("a failed transition does not run hooks of later stages", () => {
    const { onTransitionError } = createFailures();
    const order: string[] = [];
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
      onTransitionError,
      hooks: {
        onExit: {
          closed: () => {
            order.push("exit:closed");
          },
        },
        onEnter: {
          open: () => {
            order.push("enter:open");
            throw new Error("enter failed");
          },
        },
      },
    });

    machine.send("open");

    expect(order).toEqual(["exit:closed", "enter:open"]);
    expect(machine.state).toBe("closed");
  });

  test("machine stays usable and consistent after a failed transition", () => {
    let enterFails = true;
    const { onTransitionError } = createFailures();
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
      onTransitionError,
      hooks: {
        onEnter: {
          open: () => {
            if (enterFails) {
              enterFails = false;
              throw new Error("enter failed once");
            }
          },
        },
      },
    });

    machine.send("open");
    expect(machine.state).toBe("closed");

    machine.send("open");
    expect(machine.state).toBe("open");
  });
});

describe("StateMachine reset", () => {
  test("reset returns to the initial state and rules remain usable", () => {
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
    });

    machine.send("open");
    expect(machine.state).toBe("open");

    machine.reset();
    expect(machine.state).toBe("closed");

    machine.send("lock");
    expect(machine.state).toBe("locked");
  });

  test("reset does not run transition hooks", () => {
    const order: string[] = [];
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
      hooks: {
        onExit: {
          closed: () => {
            order.push("exit:closed");
          },
        },
        onEnter: {
          open: () => {
            order.push("enter:open");
          },
        },
      },
    });

    machine.send("open");
    expect(order).toEqual(["exit:closed", "enter:open"]);

    machine.reset();
    expect(machine.state).toBe("closed");
    expect(order).toEqual(["exit:closed", "enter:open"]);
  });
});

describe("StateMachine dispose", () => {
  test("after dispose the machine rejects events without side effects", () => {
    const { failures, onTransitionError } = createFailures();
    const order: string[] = [];
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
      onTransitionError,
      hooks: {
        onExit: {
          closed: () => {
            order.push("exit:closed");
          },
        },
        onEnter: {
          open: () => {
            order.push("enter:open");
          },
        },
      },
    });

    machine.dispose();
    machine.send("open");

    expect(machine.state).toBe("closed");
    expect(order).toEqual([]);
    expect(failures).toEqual([]);
  });

  test("dispose returns a DisposeHandle", () => {
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
    });

    const handle: DisposeHandle = machine.dispose();

    expect(typeof handle.dispose).toBe("function");
  });

  test("disposing the returned handle repeatedly is a no-op", () => {
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
    });

    const handle = machine.dispose();

    expect(() => {
      handle.dispose();
      handle.dispose();
      handle.dispose();
    }).not.toThrow();
  });

  test("repeated disposal is idempotent and runs no hooks", () => {
    const order: string[] = [];
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
      hooks: {
        onExit: {
          closed: () => {
            order.push("exit:closed");
          },
        },
        onEnter: {
          open: () => {
            order.push("enter:open");
          },
        },
      },
    });

    expect(() => {
      machine.dispose();
      machine.dispose();
      machine.dispose();
    }).not.toThrow();

    expect(order).toEqual([]);
  });
});

describe("StateMachine contract shape", () => {
  test("satisfies the StateMachine interface shape", () => {
    const machine = createStateMachine<DoorState, DoorEvent>({
      initial: "closed",
      transitions: DOOR_TRANSITIONS,
    });
    const typed: StateMachine<DoorState, DoorEvent> = machine;

    expect(typeof typed.send).toBe("function");
    expect(typeof typed.reset).toBe("function");
    expect(typeof typed.dispose).toBe("function");
    expect(typeof typed.state).toBe("string");
  });
});
