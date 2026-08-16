import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

/** 测试 fixture：临时仓库根 + ai-sync 根；cleanup 删除整个临时目录。 */
export interface Fixture {
    readonly root: string;
    readonly sync: string;
    readonly cleanup: () => void;
}

export function createFixture(): Fixture {
    const root = mkdtempSync(join(tmpdir(), "ai-sync-test-"));
    const sync = join(root, "tools", "ai-sync");
    write(join(sync, "registry", "skills", "demo-skill", "SKILL.md"), "demo skill body\n");
    write(join(sync, "registry", "agents", "demo-agent.md"), "demo agent body\n");
    write(join(sync, "registry", "commands", "demo-cmd.md"), "demo cmd body\n");
    return { root, sync, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** 写文件（自动建父目录）。 */
export function write(file: string, content: string): void {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content, "utf8");
}

/** 标准 fixture manifest：目录资产（skill）+ 文件资产（agent/command）。 */
export function demoManifest(): string {
    return JSON.stringify(
        {
            version: 1,
            skills: { "demo-skill": { targets: [".toolA/skills/demo-skill", ".toolB/skills/demo-skill"] } },
            agents: { "demo-agent": { targets: [".toolA/agent/demo-agent.md"] } },
            commands: { "demo-cmd": { targets: [".toolA/commands/demo-cmd.md"] } },
        },
        null,
        2,
    );
}
