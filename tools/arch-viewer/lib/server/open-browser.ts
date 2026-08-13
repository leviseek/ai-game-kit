import { spawn } from "node:child_process";
import { platform } from "node:os";

export interface OpenBrowserOptions {
    readonly platform?: NodeJS.Platform;
    readonly spawn?: typeof spawn;
    readonly writeErr?: (line: string) => void;
}

export async function openBrowser(url: string, options: OpenBrowserOptions = {}): Promise<void> {
    const currentPlatform = options.platform ?? platform();
    const spawnProcess = options.spawn ?? spawn;
    const command = resolveBrowserCommand(currentPlatform, url);

    try {
        const child = spawnProcess(command.command, command.args, {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
        });
        child.once("error", (error) => warn(options.writeErr, error));
        child.unref();
    } catch (error) {
        warn(options.writeErr, error);
    }
}

export function resolveBrowserCommand(currentPlatform: NodeJS.Platform, url: string): { readonly command: string; readonly args: readonly string[] } {
    if (currentPlatform === "win32") return { command: "cmd.exe", args: ["/c", "start", "", url] };
    if (currentPlatform === "darwin") return { command: "open", args: [url] };
    return { command: "xdg-open", args: [url] };
}

function warn(writeErr: ((line: string) => void) | undefined, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    (writeErr ?? console.warn)(`warning: failed to open browser: ${message}`);
}
