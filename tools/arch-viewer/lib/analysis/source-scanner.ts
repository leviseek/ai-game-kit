import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import ts from "typescript";

import {
    collectSourceDeclarations,
    type SourceDeclaration,
} from "./declaration-scanner";
import {
    isScannableSource,
    normalizeProjectPath,
    resolveModule,
} from "./module-resolver";

export type ImportDependencyKind = "import" | "export";
export type {
    SourceDeclaration,
    SourceDeclarationKind,
    SourceDeclarationOccurrence,
    SourceMemberKind,
} from "./declaration-scanner";

export interface ImportDependency {
    readonly fromFile: string;
    readonly toFile?: string;
    readonly specifier: string;
    readonly kind: ImportDependencyKind;
    readonly typeOnly: boolean;
    readonly external: boolean;
}

export interface SourceScanResult {
    readonly files: readonly string[];
    readonly declarations: readonly SourceDeclaration[];
    readonly imports: readonly ImportDependency[];
}

function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
    const clause = node.importClause;
    if (clause?.isTypeOnly === true) return true;
    return clause?.name === undefined
        && clause?.namedBindings !== undefined
        && ts.isNamedImports(clause.namedBindings)
        && clause.namedBindings.elements.length > 0
        && clause.namedBindings.elements.every((element) => element.isTypeOnly);
}

function isTypeOnlyExport(node: ts.ExportDeclaration): boolean {
    if (node.isTypeOnly) return true;
    return node.exportClause !== undefined
        && ts.isNamedExports(node.exportClause)
        && node.exportClause.elements.length > 0
        && node.exportClause.elements.every((element) => element.isTypeOnly);
}

function collectImports(
    projectRoot: string,
    sourceFile: ts.SourceFile,
    filePath: string,
    imports: ImportDependency[],
): void {
    for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
        const moduleSpecifier = statement.moduleSpecifier;
        if (moduleSpecifier === undefined || !ts.isStringLiteral(moduleSpecifier)) continue;

        const specifier = moduleSpecifier.text;
        const resolved = resolveModule(projectRoot, filePath, specifier);
        imports.push({
            fromFile: filePath,
            ...(resolved.toFile === undefined ? {} : { toFile: resolved.toFile }),
            specifier,
            kind: ts.isImportDeclaration(statement) ? "import" : "export",
            typeOnly: ts.isImportDeclaration(statement)
                ? isTypeOnlyImport(statement)
                : isTypeOnlyExport(statement),
            external: resolved.external,
        });
    }
}

export function scanSources(projectRoot: string, files: readonly string[]): SourceScanResult {
    const normalizedRoot = resolve(projectRoot);
    const scannedFiles = [...new Set(files
        .filter((file) => isScannableSource(normalizedRoot, file))
        .map((file) => normalizeProjectPath(relative(normalizedRoot,
            isAbsolute(file) ? resolve(file) : resolve(normalizedRoot, file)))))]
        .sort();
    const declarations: SourceDeclaration[] = [];
    const imports: ImportDependency[] = [];

    for (const filePath of scannedFiles) {
        const source = readFileSync(resolve(normalizedRoot, filePath), "utf8");
        const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
        collectImports(normalizedRoot, sourceFile, filePath, imports);
        declarations.push(...collectSourceDeclarations(sourceFile, filePath));
    }

    declarations.sort((left, right) => left.filePath.localeCompare(right.filePath)
        || left.startLine - right.startLine
        || left.endLine - right.endLine
        || left.qualifiedName.localeCompare(right.qualifiedName)
        || left.kind.localeCompare(right.kind));
    imports.sort((left, right) => left.fromFile.localeCompare(right.fromFile)
        || (left.toFile ?? "").localeCompare(right.toFile ?? "")
        || left.specifier.localeCompare(right.specifier));

    return { files: scannedFiles, declarations, imports };
}
