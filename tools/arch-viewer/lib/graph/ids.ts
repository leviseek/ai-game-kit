/** 可读标识只依赖稳定输入；后续可增加新的 kind 或 relation，无需迁移算法。 */
function joinId(parts: readonly string[]): string {
    return parts.map(encodeURIComponent).join(":");
}

export function createNodeId(
    kind: string,
    filePath: string,
    qualifiedName: string,
): string {
    return joinId([kind, filePath, qualifiedName]);
}

export function createEdgeId(
    from: string,
    to: string,
    relation: string,
): string {
    return joinId([from, to, relation]);
}
