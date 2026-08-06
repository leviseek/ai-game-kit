import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(import.meta.dir, "..", "..");
const typeCheckEntries = [
  resolve(projectRoot, "tests/framework/foundation/contracts.typecheck.ts"),
  resolve(
    projectRoot,
    "tests/framework/foundation/application-context-contract.typecheck.ts",
  ),
  resolve(projectRoot, "tests/framework/foundation/service-registry.typecheck.ts"),
];
const frameworkRoot = resolve(projectRoot, "assets/framework");

function isExcluded(directoryPath: string): boolean {
  const normalized = directoryPath.replaceAll("\\", "/");
  return normalized.includes("/adapters/cocos") || normalized.includes("\\adapters\\cocos");
}

function collectTypeScriptFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      if (isExcluded(path)) {
        return [];
      }
      return collectTypeScriptFiles(path);
    }

    return entry.isFile() && path.endsWith(".ts") ? [path] : [];
  });
}

const tscCandidates = [
  process.env.COCOS_TSC,
  process.env.COCOS_CREATOR_HOME === undefined
    ? undefined
    : resolve(
        process.env.COCOS_CREATOR_HOME,
        "resources/app.asar.unpacked/node_modules/typescript/lib/tsc.js",
      ),
  "D:\\engine\\cocos\\Creator\\3.8.8\\resources\\app.asar.unpacked\\node_modules\\typescript\\lib\\tsc.js",
  "C:\\Program Files\\CocosCreator\\Creator\\3.8.8\\resources\\app.asar.unpacked\\node_modules\\typescript\\lib\\tsc.js",
];

const tsc = tscCandidates.find(
  (candidate) => candidate !== undefined && existsSync(candidate),
);

if (tsc === undefined) {
  console.error(
    "[foundation:types] Could not locate the Cocos Creator TypeScript compiler.\n" +
      "Set COCOS_TSC to the absolute path of tsc.js, for example:\n" +
      "  <Creator 3.8.8>/resources/app.asar.unpacked/node_modules/typescript/lib/tsc.js",
  );
  process.exit(1);
}

const result = spawnSync(
  "node",
  [
    tsc,
    "--noEmit",
    "--strict",
    "--target",
    "ES2015",
    "--module",
    "ES2015",
    "--moduleResolution",
    "node",
    "--skipLibCheck",
    ...typeCheckEntries,
    ...collectTypeScriptFiles(frameworkRoot),
  ],
  { cwd: projectRoot, encoding: "utf8" },
);

if (result.stdout !== null && result.stdout.length > 0) {
  process.stdout.write(result.stdout);
}

if (result.stderr !== null && result.stderr.length > 0) {
  process.stderr.write(result.stderr);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
