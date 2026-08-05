import { describe, expect, test } from "bun:test";

import type {
  DuplicateOpenPolicy,
  UiLayer,
} from "../../../assets/framework/contracts/ui/Navigation";
import {
  createUiNavigator,
  type UiNavigator,
  type UiOpenResult,
  type UiPage,
} from "../../../assets/framework/core/ui/UiNavigator";

function openResult(
  navigator: UiNavigator,
  route: string,
  options?: { layer?: UiLayer; blocking?: boolean },
): UiOpenResult {
  return navigator.open(route, options);
}

describe("UiNavigator page stack", () => {
  test("opening a page pushes it onto the stack and makes it the top", () => {
    const navigator = createUiNavigator();

    const first = openResult(navigator, "hero");
    expect(first.ok).toBe(true);
    expect(navigator.top?.route).toBe("hero");
    expect(navigator.pages).toHaveLength(1);

    const second = openResult(navigator, "inventory");
    expect(second.ok).toBe(true);
    expect(navigator.top?.route).toBe("inventory");
    expect(navigator.pages.map((p) => p.route)).toEqual(["hero", "inventory"]);
  });

  test("closing the current page removes it and reveals the previous page", () => {
    const navigator = createUiNavigator();
    openResult(navigator, "hero");
    const inventory = openResult(navigator, "inventory");

    const result = navigator.close(inventory.page?.id);
    expect(result.ok).toBe(true);
    expect(navigator.top?.route).toBe("hero");
    expect(navigator.pages.map((p) => p.route)).toEqual(["hero"]);
  });

  test("back on an empty stack is rejected without changing state", () => {
    const navigator = createUiNavigator();

    const result = navigator.back();

    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(navigator.pages).toHaveLength(0);
    expect(navigator.top).toBeUndefined();
  });

  test("close on an empty stack is rejected without changing state", () => {
    const navigator = createUiNavigator();

    const result = navigator.close();

    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(navigator.pages).toHaveLength(0);
  });
});

describe("UiNavigator duplicate open policy", () => {
  test("focus-existing brings the already open route to the top without duplicating it", () => {
    const navigator = createUiNavigator({ duplicatePolicy: "focus-existing" });
    const hero = openResult(navigator, "hero");
    openResult(navigator, "inventory");

    const result = openResult(navigator, "hero");

    expect(result.ok).toBe(true);
    expect(result.page?.id).toBe(hero.page?.id);
    expect(navigator.top?.route).toBe("hero");
    expect(navigator.pages.map((p) => p.route)).toEqual(["inventory", "hero"]);
  });

  test("reject refuses an already open route and returns a reason", () => {
    const navigator = createUiNavigator({ duplicatePolicy: "reject" });
    const hero = openResult(navigator, "hero");

    const result = openResult(navigator, "hero");

    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(navigator.pages).toHaveLength(1);
    expect(navigator.top?.id).toBe(hero.page?.id);
  });

  test("allow-stack opens a second instance of the same route", () => {
    const navigator = createUiNavigator({ duplicatePolicy: "allow-stack" });
    const hero = openResult(navigator, "hero");

    const result = openResult(navigator, "hero");

    expect(result.ok).toBe(true);
    expect(result.page?.id).not.toBe(hero.page?.id);
    expect(navigator.pages.map((p) => p.route)).toEqual(["hero", "hero"]);
  });
});

describe("UiNavigator layer contract", () => {
  test("a higher layer page overlaps a lower layer page", () => {
    const navigator = createUiNavigator();
    const normal = openResult(navigator, "shop", { layer: "normal" });
    const popup = openResult(navigator, "confirm", { layer: "popup", blocking: true });

    expect(popup.page?.layer).toBe("popup");
    expect(normal.page?.layer).toBe("normal");
    expect(navigator.top?.route).toBe("confirm");
    // popup 层高于 normal 层：popup 位于栈顶，遮挡下层页面
    expect(navigator.pages.map((p) => p.layer)).toEqual(["normal", "popup"]);
  });

  test("closing a popup returns to the underlying page as the interactive top", () => {
    const navigator = createUiNavigator();
    openResult(navigator, "shop", { layer: "normal" });
    const popup = openResult(navigator, "confirm", { layer: "popup", blocking: true });

    const result = navigator.close(popup.page?.id);

    expect(result.ok).toBe(true);
    expect(navigator.top?.route).toBe("shop");
    expect(navigator.top?.layer).toBe("normal");
  });

  test("a lower layer page opened after a higher layer page is inserted below it", () => {
    const navigator = createUiNavigator();
    openResult(navigator, "confirm", { layer: "popup", blocking: true });
    openResult(navigator, "toast", { layer: "toast" });

    const normal = openResult(navigator, "shop", { layer: "normal" });

    expect(normal.ok).toBe(true);
    // 后打开的 normal 层必须插入到 popup/toast 之下，而不是简单压栈到栈顶
    expect(navigator.pages.map((p) => p.layer)).toEqual([
      "normal",
      "popup",
      "toast",
    ]);
    expect(navigator.top?.route).toBe("toast");
  });

  test("layers cover the fixed seven-layer order with system highest", () => {
    const navigator = createUiNavigator();
    const opened: Array<{ route: string; layer: UiLayer }> = [];
    const entries: Array<[string, UiLayer]> = [
      ["scene", "scene"],
      ["hud", "normal"],
      ["confirm", "popup"],
      ["guide", "guide"],
      ["toast", "toast"],
      ["loading", "loading"],
      ["sys", "system"],
    ];
    for (const [route, layer] of entries) {
      const result = openResult(navigator, route, { layer });
      expect(result.ok).toBe(true);
      opened.push({ route, layer });
    }

    expect(navigator.pages.map((p) => p.layer)).toEqual([
      "scene",
      "normal",
      "popup",
      "guide",
      "toast",
      "loading",
      "system",
    ]);
    expect(navigator.top?.route).toBe("sys");
  });
});

describe("UiNavigator modal and input blocking", () => {
  test("a blocking page becomes modal when it is the top", () => {
    const navigator = createUiNavigator();
    openResult(navigator, "shop", { layer: "normal" });
    expect(navigator.modal).toBe(false);

    openResult(navigator, "confirm", { layer: "popup", blocking: true });

    expect(navigator.modal).toBe(true);
  });

  test("blocking is released when the modal page closes", () => {
    const navigator = createUiNavigator();
    openResult(navigator, "shop", { layer: "normal" });
    const popup = openResult(navigator, "confirm", { layer: "popup", blocking: true });
    expect(navigator.modal).toBe(true);

    navigator.close(popup.page?.id);

    expect(navigator.modal).toBe(false);
  });

  test("a non-blocking top page reports non-modal", () => {
    const navigator = createUiNavigator();
    openResult(navigator, "hud", { layer: "normal" });

    expect(navigator.modal).toBe(false);
  });
});

describe("UiNavigator page scope", () => {
  test("closing a page releases its subscriptions in reverse registration order", () => {
    const navigator = createUiNavigator();
    const result = openResult(navigator, "hero");
    const page = result.page as UiPage;
    const released: string[] = [];
    page.addDisposable({
      dispose: () => {
        released.push("first");
      },
    });
    page.addDisposable({
      dispose: () => {
        released.push("second");
      },
    });

    navigator.close(page.id);

    expect(released).toEqual(["second", "first"]);
    expect(page.disposed).toBe(true);
  });

  test("duplicate close is idempotent and releases the scope only once", () => {
    const navigator = createUiNavigator();
    const result = openResult(navigator, "hero");
    const page = result.page as UiPage;
    let releases = 0;
    page.addDisposable({
      dispose: () => {
        releases += 1;
      },
    });

    navigator.close(page.id);
    const second = navigator.close(page.id);

    expect(second.ok).toBe(false);
    expect(releases).toBe(1);
    expect(navigator.pages).toHaveLength(0);
  });

  test("disposing the navigator rejects further open requests", () => {
    const navigator = createUiNavigator();
    openResult(navigator, "hero");

    navigator.dispose();

    const result = openResult(navigator, "inventory");
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(navigator.pages).toHaveLength(0);
  });
});
