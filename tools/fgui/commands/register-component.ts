import { flagString, hasHelp, parseArgs, requireFlag } from "../lib/args";
import { locateProject, readPackage } from "../lib/fgui";
import { registerComponent } from "../lib/sprite";

export const help = "register-component —— 在 package.xml 幂等登记一个组件（已存在则返回原 id）";

export async function run(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (hasHelp(parsed)) {
    console.log(help);
    return 0;
  }

  const packageName = requireFlag(parsed, "package", "register-component --package <包名> --name <组件文件.xml> [--path <目录>]");
  const name = requireFlag(parsed, "name", "register-component --package <包名> --name <组件文件.xml>");
  const pathArg = flagString(parsed, "path") ?? "/";
  const projectArg = flagString(parsed, "project");

  const fileName = name.endsWith(".xml") ? name : `${name}.xml`;
  const project = locateProject(projectArg);
  const pkg = readPackage(project, packageName);

  const id = registerComponent(pkg, fileName, pathArg);
  console.log(`已登记组件 ${fileName} id=${id}`);
  return 0;
}
