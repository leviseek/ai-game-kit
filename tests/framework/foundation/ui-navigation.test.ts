import { describe, expect, test } from "bun:test";

import type {
  DuplicateOpenPolicy,
  UiLayer,
  UiPage,
  UiResult,
} from "../../../assets/framework/contracts/ui/Navigation";
import {
  createUiNavigator,
  type UiNavigator,
} from "../../../assets/framework/core/ui/UiNavigator";

function openResult(
  navigator: UiNavigator,
  route: string,
  options?: { layer?: UiLayer; blocking?: boolean },
): UiResult {
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

  test("focus-existing raises the page within its layer without breaking layer coverage", () => {
    const navigator = createUiNavigator({ duplicatePolicy: "focus-existing" });
    openResult(navigator, "shop", { layer: "normal" });
    openResult(navigator, "confirm", { layer: "popup", blocking: true });
    openResult(navigator, "toast", { layer: "toast" });

    const result = openResult(navigator, "confirm", { layer: "popup", blocking: true });

    expect(result.ok).toBe(true);
    expect(result.page?.layer).toBe("popup");
    // 层级不变量：popup 提升到 popup 层最高位置，但不得压过更高层的 toast
    expect(navigator.pages.map((p) => p.layer)).toEqual([
      "normal",
      "popup",
      "toast",
    ]);
    expect(navigator.top?.route).toBe("toast");
    // 模态由栈顶推导：toast 非阻断，focus 的 popup 虽被激活但不处于栈顶
    expect(navigator.modal).toBe(false);
  });

  test("focus-existing raises a blocking page and modal follows the top page", () => {
    const navigator = createUiNavigator({ duplicatePolicy: "focus-existing" });
    const confirm = openResult(navigator, "confirm", { layer: "popup", blocking: true });
    openResult(navigator, "toast", { layer: "toast" });
    expect(navigator.modal).toBe(false);

    // 关闭更高层的 toast 后，popup 成为栈顶，模态收敛为阻断
    navigator.close(navigator.top?.id);
    expect(navigator.modal).toBe(true);

    // 再次 focus 已是栈顶的 popup：保持栈顶且模态不改变
    const result = openResult(navigator, "confirm", { layer: "popup", blocking: true });
    expect(result.ok).toBe(true);
    expect(result.page?.id).toBe(confirm.page?.id);
    expect(navigator.top?.route).toBe("confirm");
    expect(navigator.modal).toBe(true);
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

  test("disposing the navigator rejects close and back requests", () => {
    const navigator = createUiNavigator();
    openResult(navigator, "hero");

    navigator.dispose();

    const closeResult = navigator.close();
    expect(closeResult.ok).toBe(false);
    expect(closeResult.reason).toBe("disposed");

    const backResult = navigator.back();
    expect(backResult.ok).toBe(false);
    expect(backResult.reason).toBe("disposed");
  });

  test("a throwing disposable does not stop the remaining scope release", () => {
    const errors: unknown[] = [];
    const navigator = createUiNavigator({
      onError: (error) => {
        errors.push(error);
      },
    });
    const result = openResult(navigator, "hero");
    const page = result.page as UiPage;
    const released: string[] = [];
    page.addDisposable({
      dispose: () => {
        throw new Error("first fails");
      },
    });
    page.addDisposable({
      dispose: () => {
        released.push("second");
      },
    });

    navigator.close(page.id);

    expect(errors).toHaveLength(1);
    expect(released).toEqual(["second"]);
    expect(page.disposed).toBe(true);
  });

  test("a throwing disposable during dispose does not stop other pages from being released", () => {
    const errors: unknown[] = [];
    const navigator = createUiNavigator({
      onError: (error) => {
        errors.push(error);
      },
    });
    const hero = openResult(navigator, "hero");
    openResult(navigator, "inventory");
    hero.page?.addDisposable({
      dispose: () => {
        throw new Error("hero fails");
      },
    });
    const inventoryDisposed: string[] = [];
    (navigator.pages[1] as UiPage).addDisposable({
      dispose: () => {
        inventoryDisposed.push("inventory");
      },
    });

    navigator.dispose();

    expect(errors).toHaveLength(1);
    expect(inventoryDisposed).toEqual(["inventory"]);
    expect(navigator.pages).toHaveLength(0);
  });

  test("addDisposable after close is a no-op", () => {
    const navigator = createUiNavigator();
    const result = openResult(navigator, "hero");
    const page = result.page as UiPage;
    navigator.close(page.id);
    const released: string[] = [];
    page.addDisposable({
      dispose: () => {
        released.push("late");
      },
    });

    expect(released).toEqual([]);
    expect(page.disposed).toBe(true);
  });

  test("closing a non-top page keeps the remaining stack order and top unchanged", () => {
    const navigator = createUiNavigator();
    openResult(navigator, "hero");
    const inventory = openResult(navigator, "inventory");
    const popup = openResult(navigator, "confirm", { layer: "popup", blocking: true });
    expect(navigator.top?.route).toBe("confirm");

    const result = navigator.close(inventory.page?.id);

    expect(result.ok).toBe(true);
    expect(navigator.pages.map((p) => p.route)).toEqual(["hero", "confirm"]);
    expect(navigator.top?.route).toBe("confirm");
    // 顶层 popup 仍阻断，模态状态保持
    expect(navigator.modal).toBe(true);
  });
});
