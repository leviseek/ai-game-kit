import { flagString, hasHelp, parseArgs, requireFlag } from "../lib/args";
import { locateProject, nextResourceId, readPackage } from "../lib/fgui";

export const help = "next-id —— 分配不冲突的资源短 id";

export async function run(argv: readonly string[]): Promise<number> {
    const parsed = parseArgs(argv);
    if (hasHelp(parsed)) {
        console.log(help);
        return 0;
    }

    const packageName = requireFlag(parsed, "package", "next-id --package <包名> [--prefix <前缀>]");
    const prefix = flagString(parsed, "prefix");
    const projectArg = flagString(parsed, "project");
    const project = locateProject(projectArg);
    const pkg = readPackage(project, packageName);

    const id = nextResourceId(pkg, prefix);
    console.log(id);
    return 0;
}
