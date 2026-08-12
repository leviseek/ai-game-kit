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
    exportedNames: ReadonlySet<string>,
    declarations: Map<string, SourceDeclaration>,
): string | undefined {
    const name = declarationName(node);
    if (name === undefined) return undefined;

    const qualifiedName = [...scope, name].join("::");
    const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const endLine = sourceFile.getLineAndCharacterOfPosition(node.end).line + 1;
    const id = createNodeId(kind, filePath, qualifiedName);
    const existing = declarations.get(id);
    declarations.set(id, {
        id,
        name,
        qualifiedName,
        kind,
        filePath,
        startLine: Math.min(existing?.startLine ?? startLine, startLine),
        endLine: Math.max(existing?.endLine ?? endLine, endLine),
        exported: existing?.exported === true
            || hasExportModifier(node)
            || (scope.length === 0 && exportedNames.has(name)),
    });
    return name;
}

function collectExportedNames(sourceFile: ts.SourceFile): ReadonlySet<string> {
    const names = new Set<string>();
    for (const statement of sourceFile.statements) {
        if (ts.isExportDeclaration(statement)
            && statement.moduleSpecifier === undefined
            && statement.exportClause !== undefined
            && ts.isNamedExports(statement.exportClause)) {
            for (const element of statement.exportClause.elements) {
                names.add((element.propertyName ?? element.name).text);
            }
        } else if (ts.isExportAssignment(statement)
            && !statement.isExportEquals
            && ts.isIdentifier(statement.expression)) {
            names.add(statement.expression.text);
        }
    }
    return names;
}

function collectDeclarations(
    sourceFile: ts.SourceFile,
    filePath: string,
    declarations: Map<string, SourceDeclaration>,
): void {
    const exportedNames = collectExportedNames(sourceFile);
    const visit = (node: ts.Node, scope: readonly string[]): void => {
        if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
            const kind = ts.isClassDeclaration(node) ? "class" : "interface";
            const name = addDeclaration(
                sourceFile, filePath, node, kind, scope, exportedNames, declarations,
            );
            if (name !== undefined) {
                for (const member of node.members) visit(member, [...scope, name]);
            }
            return;
        }
        if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
            const name = addDeclaration(
                sourceFile, filePath, node, "method", scope, exportedNames, declarations,
            );
            if (name !== undefined && ts.isMethodDeclaration(node) && node.body !== undefined) {
                for (const statement of node.body.statements) visit(statement, [...scope, name]);
            }
            return;
        }
        if (ts.isFunctionDeclaration(node)) {
            const name = addDeclaration(
                sourceFile, filePath, node, "function", scope, exportedNames, declarations,
            );
            if (name !== undefined && node.body !== undefined) {
                for (const statement of node.body.statements) visit(statement, [...scope, name]);
            }
            return;
        }
        if (ts.isTypeAliasDeclaration(node)) {
            addDeclaration(sourceFile, filePath, node, "type", scope, exportedNames, declarations);
            return;
        }
        if (ts.isBlock(node)) {
            for (const statement of node.statements) visit(statement, scope);
        } else if (ts.isIfStatement(node)) {
            visit(node.thenStatement, scope);
            if (node.elseStatement !== undefined) visit(node.elseStatement, scope);
        } else if (ts.isForStatement(node)
            || ts.isForInStatement(node)
            || ts.isForOfStatement(node)
            || ts.isWhileStatement(node)
            || ts.isDoStatement(node)
            || ts.isLabeledStatement(node)
            || ts.isWithStatement(node)) {
            visit(node.statement, scope);
        } else if (ts.isTryStatement(node)) {
            visit(node.tryBlock, scope);
            if (node.catchClause !== undefined) visit(node.catchClause.block, scope);
            if (node.finallyBlock !== undefined) visit(node.finallyBlock, scope);
        } else if (ts.isSwitchStatement(node)) {
            for (const clause of node.caseBlock.clauses) {
                for (const statement of clause.statements) visit(statement, scope);
            }
        }
    };

    for (const statement of sourceFile.statements) visit(statement, []);
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
    const declarationsById = new Map<string, SourceDeclaration>();
    const imports: ImportDependency[] = [];

    for (const filePath of scannedFiles) {
        const source = readFileSync(resolve(normalizedRoot, filePath), "utf8");
        const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
        collectImports(normalizedRoot, sourceFile, filePath, imports);
        collectDeclarations(sourceFile, filePath, declarationsById);
    }

    const declarations = [...declarationsById.values()];
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
