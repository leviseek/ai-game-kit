import { startWorkbench } from "./app.js";

void startWorkbench().catch((error) => {
    const status = document.getElementById("status");
    if (status !== null) status.textContent = error instanceof Error ? error.message : String(error);
});
