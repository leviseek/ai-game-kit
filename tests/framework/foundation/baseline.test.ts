import { expect, test } from "bun:test";

test("foundation test gate executes TypeScript tests", () => {
  const runtime: string = "bun";

  expect(runtime).toBe("bun");
});
