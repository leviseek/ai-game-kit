import type { GraphNode } from "../../lib/graph/types.js";

export interface SearchRendererOptions {
    readonly input: HTMLInputElement;
    readonly results: HTMLElement;
    readonly onQuery: (query: string) => Promise<readonly GraphNode[]>;
    readonly onSelect: (id: string) => void;
}

export function bindSearch(options: SearchRendererOptions): void {
    let timer: number | undefined;
    options.input.addEventListener("input", () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void runSearch(options), 150);
    });
}

async function runSearch(options: SearchRendererOptions): Promise<void> {
    const query = options.input.value.trim();
    if (query === "") {
        options.results.replaceChildren();
        return;
    }
    options.results.replaceChildren(textItem("Searching..."));
    try {
        const nodes = await options.onQuery(query);
        options.results.replaceChildren(...nodes.slice(0, 20).map((node) => resultButton(node, options.onSelect)));
    } catch (error) {
        options.results.replaceChildren(textItem(error instanceof Error ? error.message : String(error)));
    }
}

function resultButton(node: GraphNode, onSelect: (id: string) => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result";
    const title = document.createElement("span");
    title.textContent = node.label;
    const meta = document.createElement("small");
    meta.textContent = `${node.kind} ${node.location?.filePath ?? node.qualifiedName ?? node.id}`;
    button.append(title, meta);
    button.addEventListener("click", () => onSelect(node.id));
    return button;
}

function textItem(text: string): HTMLDivElement {
    const item = document.createElement("div");
    item.className = "search-empty";
    item.textContent = text;
    return item;
}
