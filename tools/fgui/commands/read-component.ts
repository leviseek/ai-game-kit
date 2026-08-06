import { flagString, hasHelp, parseArgs, requireFlag } from "../lib/args";
import { locateProject, readComponent, readPackage } from "../lib/fgui";

export const help = "read-component —— 读取组件结构索引（对象 id/名称/类型/坐标/引用）";

export async function run(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (hasHelp(parsed)) {
    console.log(help);
    return 0;
  }

  const packageName = requireFlag(parsed, "package", "read-component --package <包名> --component <组件名>");
  const componentName = requireFlag(parsed, "component", "read-component --package <包名> --component <组件名>");
  const projectArg = flagString(parsed, "project");
  const project = locateProject(projectArg);
  const pkg = readPackage(project, packageName);
  const component = readComponent(project, packageName, componentName);

  console.log(`组件: ${packageName}/${componentName} 对象数: ${component.objects.length}`);
  console.log(`包资源引用表:`);
  for (const r of pkg.resources) {
    if (r.kind === "component" || r.kind === "image") {
      console.log(`  ${r.kind.padEnd(9)} ${r.id.padEnd(6)} ${r.name}`);
    }
  }
  console.log(`对象索引:`);
  for (const obj of component.objects) {
    const parts = [
      obj.id,
      obj.name ? `name=${obj.name}` : "",
      obj.type,
      obj.xy ? `xy=${obj.xy}` : "",
      obj.size ? `size=${obj.size}` : "",
      obj.src ? `src=${obj.src}` : "",
      obj.fileName ? `file=${obj.fileName}` : "",
      obj.pkg ? `pkg=${obj.pkg}` : "",
      obj.visible === "false" ? "visible=false" : "",
    ];
    console.log(`  ${parts.filter(Boolean).join("  ")}`);
  }
  return 0;
}
