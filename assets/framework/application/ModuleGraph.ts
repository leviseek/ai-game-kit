import type { IModule } from "../contracts/interfaces/IModule";

/**
 * 模块依赖图：输入校验（空 id、重复 id、缺失依赖、循环依赖均抛错），
 * 产出按依赖拓扑序排列的 orderedModules（冻结数组）。
 */
export class ModuleGraph {
    readonly orderedModules: readonly IModule[];

    constructor(modules: readonly IModule[]) {
        const registeredModules = [...modules];
        const modulesById = new Map<string, IModule>();
        const registrationIndex = new Map<string, number>();

        for (const [index, module] of registeredModules.entries()) {
            if (module.id.trim().length === 0) {
                throw new Error("IModule id cannot be empty");
            }

            if (modulesById.has(module.id)) {
                throw new Error(`Duplicate module id: ${module.id}`);
            }

            modulesById.set(module.id, module);
            registrationIndex.set(module.id, index);
        }

        const dependencyCount = new Map<string, number>();
        const dependents = new Map<string, IModule[]>();

        for (const module of registeredModules) {
            dependencyCount.set(module.id, 0);
            dependents.set(module.id, []);
        }

        for (const module of registeredModules) {
            for (const dependencyId of module.dependencies) {
                if (!modulesById.has(dependencyId)) {
                    throw new Error(`IModule "${module.id}" depends on missing module "${dependencyId}"`);
                }

                dependencyCount.set(module.id, (dependencyCount.get(module.id) ?? 0) + 1);
                dependents.get(dependencyId)?.push(module);
            }
        }

        const readyModules = registeredModules.filter((module) => dependencyCount.get(module.id) === 0);
        const orderedModules: IModule[] = [];

        while (readyModules.length > 0) {
            const module = readyModules.shift();

            if (module === undefined) {
                break;
            }

            orderedModules.push(module);

            for (const dependent of dependents.get(module.id) ?? []) {
                const remainingDependencies = (dependencyCount.get(dependent.id) ?? 0) - 1;

                dependencyCount.set(dependent.id, remainingDependencies);

                if (remainingDependencies === 0) {
                    readyModules.push(dependent);
                    // 多个模块同时就绪时按注册顺序排序，保证启动顺序确定、可复现。
                    readyModules.sort((left, right) => (registrationIndex.get(left.id) ?? 0) - (registrationIndex.get(right.id) ?? 0));
                }
            }
        }

        if (orderedModules.length !== registeredModules.length) {
            throw new Error("IModule dependency graph contains a cycle");
        }

        this.orderedModules = Object.freeze(orderedModules);
    }
}
