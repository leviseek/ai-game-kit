import { validateManifest, type Manifest, type ManifestIssue } from "./manifest";
import { loadModels, validateAgentTemplates, validateModels } from "./models";

/**
 * 全量结构校验 = manifest 校验 + 模型注册表校验 + agent 模板可渲染校验。
 * check/sync/doctor 统一走此入口，保证结构错误短路语义一致。
 */
export function validateAll(aiSyncRoot: string, manifest: Manifest): ManifestIssue[] {
    const models = loadModels(aiSyncRoot);
    return [...validateManifest(aiSyncRoot, manifest), ...validateModels(models), ...validateAgentTemplates(aiSyncRoot, models)];
}
