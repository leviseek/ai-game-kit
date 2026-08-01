import type { Module } from "../contracts/module/Module";

export class ModuleGraph {
  readonly orderedModules: readonly Module[];

  constructor(modules: readonly Module[]) {
    const registeredModules = [...modules];
    const modulesById = new Map<string, Module>();
    const registrationIndex = new Map<string, number>();

    for (const [index, module] of registeredModules.entries()) {
      if (module.id.trim().length === 0) {
        throw new Error("Module id cannot be empty");
      }

      if (modulesById.has(module.id)) {
        throw new Error(`Duplicate module id: ${module.id}`);
      }

      modulesById.set(module.id, module);
      registrationIndex.set(module.id, index);
    }

    const dependencyCount = new Map<string, number>();
    const dependents = new Map<string, Module[]>();

    for (const module of registeredModules) {
      dependencyCount.set(module.id, 0);
      dependents.set(module.id, []);
    }

    for (const module of registeredModules) {
      for (const dependencyId of module.dependencies) {
        if (!modulesById.has(dependencyId)) {
          throw new Error(
            `Module "${module.id}" depends on missing module "${dependencyId}"`,
          );
        }

        dependencyCount.set(
          module.id,
          (dependencyCount.get(module.id) ?? 0) + 1,
        );
        dependents.get(dependencyId)?.push(module);
      }
    }

    const readyModules = registeredModules.filter(
      (module) => dependencyCount.get(module.id) === 0,
    );
    const orderedModules: Module[] = [];

    while (readyModules.length > 0) {
      const module = readyModules.shift();

      if (module === undefined) {
        break;
      }

      orderedModules.push(module);

      for (const dependent of dependents.get(module.id) ?? []) {
        const remainingDependencies =
          (dependencyCount.get(dependent.id) ?? 0) - 1;

        dependencyCount.set(dependent.id, remainingDependencies);

        if (remainingDependencies === 0) {
          readyModules.push(dependent);
          readyModules.sort(
            (left, right) =>
              (registrationIndex.get(left.id) ?? 0) -
              (registrationIndex.get(right.id) ?? 0),
          );
        }
      }
    }

    if (orderedModules.length !== registeredModules.length) {
      throw new Error("Module dependency graph contains a cycle");
    }

    this.orderedModules = Object.freeze(orderedModules);
  }
}
