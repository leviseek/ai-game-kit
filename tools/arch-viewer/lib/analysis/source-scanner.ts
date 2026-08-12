import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import ts from "typescript";

import { createNodeId } from "../graph/ids";
import {
    isScannableSource,
    normalizeProjectPath,
    resolveModule,
} from "./module-resolver";

export type ImportDependencyKind = "import" | "export";
export type SourceDeclarationKind = "class" | "function" | "interface" | "method" | "type";

export interface ImportDependency {
    readonly fromFile: string;
    readonly toFile?: string;
    readonly specifier: string;
    readonly kind: ImportDependencyKind;
    readonly typeOnly: boolean;
    readonly external: boolean;
}

export interface SourceDeclaration {
    readonly id: string;
    readonly name: string;
    readonly qualifiedName: string;
    readonly kind: SourceDeclarationKind;
    readonly filePath: string;
    readonly startLine: number;
    readonly endLine: number;
    readonly exported: boolean;
}

export interface SourceScanResult {
    readonly files: readonly string[];
    readonly declarations: readonly SourceDeclaration[];
    readonly imports: readonly ImportDependency[];
}

function hasExportModifier(node: ts.Node): boolean {
    return ts.canHaveModifiers(node)
        && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function declarationName(node: ts.NamedDeclaration): string | undefined {
    const name = node.name;
    return name !== undefined && (
        ts.isIdentifier(name)
        || ts.isPrivateIdentifier(name)
        || ts.isStringLiteral(name)
        || ts.isNumericLiteral(name)
    ) ? name.text : undefined;
}

function addDeclaration(
    sourceFile: ts.SourceFile,
    filePath: string,
    node: ts.NamedDeclaration,
    kind: SourceDeclarationKind,
    scope: readonly string[],
    declarations: SourceDeclaration[],
): string | undefined {
    const name = declarationName(node);
    if (name === undefined) return undefined;

    const qualifiedName = [...scope, name].join("::");
    const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const endLine = sourceFile.getLineAndCharacterOfPosition(node.end).line + 1;
    declarations.push({
        id: createNodeId(kind, filePath, qualifiedName),
        name,
        qualifiedName,
        kind,
        filePath,
        startLine,
        endLine,
        exported: hasExportModifier(node),
    });
    return name;
}

function collectDeclarations(
    sourceFile: ts.SourceFile,
    filePath: string,
    declarations: SourceDeclaration[],
): void {
    const visit = (node: ts.Node, scope: readonly string[]): void => {
        if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
            const kind = ts.isClassDeclaration(node) ? "class" : "interface";
            const name = addDeclaration(sourceFile, filePath, node, kind, scope, declarations);
            if (name !== undefined) {
                for (const member of node.members) visit(member, [...scope, name]);
            }
            return;
        }
        if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
            const name = addDeclaration(sourceFile, filePath, node, "method", scope, declarations);
            if (name !== undefined && ts.isMethodDeclaration(node) && node.body !== undefined) {
                ts.forEachChild(node.body, (child) => visit(child, [...scope, name]));
            }
            return;
        }
        if (ts.isFunctionDeclaration(node)) {
            const name = addDeclaration(sourceFile, filePath, node, "function", scope, declarations);
            if (name !== undefined && node.body !== undefined) {
                ts.forEachChild(node.body, (child) => visit(child, [...scope, name]));
            }
            return;
        }
        if (ts.isTypeAliasDeclaration(node)) {
            addDeclaration(sourceFile, filePath, node, "type", scope, declarations);
            return;
        }
        ts.forEachChild(node, (child) => visit(child, scope));
    };

    visit(sourceFile, []);
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
    const scannedFiles = files
        .filter((file) => isScannableSource(normalizedRoot, file))
        .map((file) => normalizeProjectPath(relative(normalizedRoot,
            isAbsolute(file) ? resolve(file) : resolve(normalizedRoot, file))))
        .sort();
    const declarations: SourceDeclaration[] = [];
    const imports: ImportDependency[] = [];

    for (const filePath of scannedFiles) {
        const source = readFileSync(resolve(normalizedRoot, filePath), "utf8");
        const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
        collectImports(normalizedRoot, sourceFile, filePath, imports);
        collectDeclarations(sourceFile, filePath, declarations);
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
