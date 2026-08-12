import ts from "typescript";

import { createNodeId } from "../graph/ids";

export type SourceDeclarationKind = "class" | "function" | "interface" | "method" | "type";

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

interface ScanScope {
    readonly names: readonly string[];
    readonly key: string;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
    return ts.canHaveModifiers(node)
        && ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) === true;
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

function memberCategory(node: ts.MethodDeclaration | ts.MethodSignature
    | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration): string {
    const placement = hasModifier(node, ts.SyntaxKind.StaticKeyword) ? "static" : "instance";
    if (ts.isGetAccessorDeclaration(node)) return `${placement}:get`;
    if (ts.isSetAccessorDeclaration(node)) return `${placement}:set`;
    return `${placement}:method`;
}

export function collectSourceDeclarations(
    sourceFile: ts.SourceFile,
    filePath: string,
): readonly SourceDeclaration[] {
    const declarations = new Map<string, SourceDeclaration>();
    const exportedNames = collectExportedNames(sourceFile);
    const scopeOrdinals = new Map<string, number>();

    const childScope = (scope: ScanScope, label: string, names = scope.names): ScanScope => {
        const base = `${scope.key}/${label}`;
        const ordinal = scopeOrdinals.get(base) ?? 0;
        scopeOrdinals.set(base, ordinal + 1);
        return { names, key: `${base}#${ordinal}` };
    };

    const addDeclaration = (
        node: ts.NamedDeclaration,
        kind: SourceDeclarationKind,
        scope: ScanScope,
        category: string,
    ): string | undefined => {
        const name = declarationName(node);
        if (name === undefined) return undefined;

        const qualifiedName = [...scope.names, name].join("::");
        const scopeKey = `${scope.key}|${category}`;
        const id = createNodeId(kind, filePath, qualifiedName, scopeKey);
        const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        const endLine = sourceFile.getLineAndCharacterOfPosition(node.end).line + 1;
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
                || hasModifier(node, ts.SyntaxKind.ExportKeyword)
                || (scope.names.length === 0 && exportedNames.has(name)),
        });
        return name;
    };

    const visitStatements = (statements: ts.NodeArray<ts.Statement>, scope: ScanScope): void => {
        for (const statement of statements) visit(statement, scope);
    };

    const visitMemberBody = (
        body: ts.Block | undefined,
        scope: ScanScope,
        label: string,
        names: readonly string[],
    ): void => {
        if (body !== undefined) visitStatements(body.statements, childScope(scope, label, names));
    };

    const visit = (node: ts.Node, scope: ScanScope): void => {
        if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
            const kind = ts.isClassDeclaration(node) ? "class" : "interface";
            const name = addDeclaration(node, kind, scope, kind);
            if (name !== undefined) {
                const ownerScope = { names: [...scope.names, name], key: `${scope.key}/${kind}:${name}` };
                for (const member of node.members) visit(member, ownerScope);
            }
            return;
        }
        if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)
            || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
            const category = memberCategory(node);
            const name = addDeclaration(node, "method", scope, category);
            const body = ts.isMethodSignature(node) ? undefined : node.body;
            if (name !== undefined) {
                visitMemberBody(body, scope, `member:${category}:${name}`, [...scope.names, name]);
            }
            return;
        }
        if (ts.isConstructorDeclaration(node)) {
            visitMemberBody(node.body, scope, "constructor", [...scope.names, "constructor"]);
            return;
        }
        if (ts.isClassStaticBlockDeclaration(node)) {
            visitMemberBody(node.body, scope, "static-block", scope.names);
            return;
        }
        if (ts.isFunctionDeclaration(node)) {
            const name = addDeclaration(node, "function", scope, "function");
            if (name !== undefined) {
                visitMemberBody(node.body, scope, `function:${name}`, [...scope.names, name]);
            }
            return;
        }
        if (ts.isTypeAliasDeclaration(node)) {
            addDeclaration(node, "type", scope, "type");
            return;
        }
        if (ts.isBlock(node)) {
            visitStatements(node.statements, childScope(scope, "block"));
        } else if (ts.isIfStatement(node)) {
            visit(node.thenStatement, childScope(scope, "if-then"));
            if (node.elseStatement !== undefined) visit(node.elseStatement, childScope(scope, "if-else"));
        } else if (ts.isForStatement(node) || ts.isForInStatement(node)
            || ts.isForOfStatement(node) || ts.isWhileStatement(node)
            || ts.isDoStatement(node) || ts.isLabeledStatement(node)
            || ts.isWithStatement(node)) {
            visit(node.statement, childScope(scope, "statement-body"));
        } else if (ts.isTryStatement(node)) {
            visit(node.tryBlock, childScope(scope, "try"));
            if (node.catchClause !== undefined) visit(node.catchClause.block, childScope(scope, "catch"));
            if (node.finallyBlock !== undefined) visit(node.finallyBlock, childScope(scope, "finally"));
        } else if (ts.isSwitchStatement(node)) {
            const switchScope = childScope(scope, "switch");
            for (const clause of node.caseBlock.clauses) visitStatements(clause.statements, switchScope);
        }
    };

    visitStatements(sourceFile.statements, { names: [], key: "module" });
    return [...declarations.values()];
}
