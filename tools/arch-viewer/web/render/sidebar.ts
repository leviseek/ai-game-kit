import type { ViewType } from "../../lib/graph/types";

export const viewTypes: readonly ViewType[] = ["hierarchy", "startup", "dependencies", "data-flow", "calls", "resources"];

export function bindSidebar(root: Document, onView: (viewType: ViewType) => void): void {
    for (const viewType of viewTypes) {
        const button = root.getElementById(`nav-${viewType}`);
        if (!(button instanceof HTMLButtonElement)) continue;
        button.addEventListener("click", () => onView(viewType));
    }
}

export function renderSidebar(root: Document, active: ViewType): void {
    for (const viewType of viewTypes) {
        const button = root.getElementById(`nav-${viewType}`);
        if (!(button instanceof HTMLButtonElement)) continue;
        button.classList.toggle("active", viewType === active);
        button.setAttribute("aria-pressed", String(viewType === active));
    }
}
