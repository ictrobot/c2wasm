import {CVariable, CFuncDefinition, CArgument, CFuncDeclaration} from "../ir/declarations";
import {CAssignment, CIdentifier} from "../ir/expressions";
import {Scope} from "../ir/scope";
import {CStatement, CCompoundStatement, CExpressionStatement, CNop} from "../ir/statements";
import {CType, getArithmeticType, CPointer, CFuncType, addQualifier, CNotFuncType} from "../ir/types";
import {ExpressionStatement} from "../parsing/parsetree";
import * as pt from "../parsing/parsetree";
import {ParseTreeValidationError} from "../parsing/validation";
import {ptExpression} from "./expr_transform";

export function transform(translationUnit: pt.TranslationUnit): Scope {
    const fileScope = new Scope();
    for (const decl of translationUnit) {
        if (decl instanceof pt.FunctionDefinition) {
            ptFunction(decl, fileScope);
        } else {
            ptDeclaration(decl, fileScope, false);
        }
    }
    return fileScope;
}

function ptDeclaration(declaration: pt.Declaration, scope: Scope, inFunction: boolean): CAssignment[] {
    const declType = getSpecifierType(declaration.typeInfo, scope);
    const assignments = [];
    for (const entry of declaration.list) {
        const name = getDeclaratorName(entry);
        let type = getDeclaratorType(declType, entry instanceof pt.InitDeclarator ? entry.body : entry, scope);
        type = addQualifier(type, declaration.typeInfo.qualifierList[0]);

        if (type instanceof CFuncType) {
            // function declarations
            scope.addIdentifier(new CFuncDeclaration(name, type, declaration.typeInfo.storageList[0]));
        } else {
            // variable
            const cvar = new CVariable(name, type, declaration.typeInfo.storageList[0]);
            scope.addIdentifier(cvar);

            if (entry instanceof pt.InitDeclarator) {
                // initialized variable
                const initialValue = entry.initializer;

                if (Array.isArray(initialValue)) {
                    // support struct initialization
                    throw new ParseTreeValidationError(entry, "Not implemented"); // TODO
                } else {
                    const value = ptExpression(initialValue as pt.Expression, scope);
                    const assignment = new CAssignment(entry, new CIdentifier(entry, cvar), value);
                    if (inFunction) {
                        // in function so return assignment to be added to body of fn
                        assignments.push(assignment);
                    } else {
                        // add initializer to var declaration
                        cvar.initial = assignment;
                    }
                }
            }
        }
    }
    return assignments;
}

function ptFunction(fn: pt.FunctionDefinition, scope: Scope): void {
    // fn type
    let type = getSpecifierType(fn.typeInfo, scope);
    type = getDeclaratorType(type, fn.declarator, scope);
    if (!(type instanceof CFuncType)) throw new ParseTreeValidationError(fn, "Unexpected declarator");
    type = addQualifier(type, fn.typeInfo.qualifierList[0]);
    // fn name
    const name = getDeclaratorName(fn.declarator);

    const cfn = new CFuncDefinition(name, type, fn.typeInfo.storageList[0], fn, scope);
    scope.addIdentifier(cfn);

    // add arguments as parameters to function's scope
    if (!type.parameterNames) throw new ParseTreeValidationError(fn, "Expected parameter names");
    for (let i = 0; i < type.parameterTypes.length; i++) {
        cfn.scope.addIdentifier(new CArgument(type.parameterNames[i], type.parameterTypes[i]));
    }

    // parse body
    ptCompound(fn.body, cfn);
}

function ptStatement(node: pt.Statement, parent: CStatement): CStatement {
    if (node instanceof pt.CompoundStatement) {
        return ptCompound(node, parent);
    } else if (node instanceof ExpressionStatement) {
        return new CExpressionStatement(node, ptExpression(node.expression, parent.scope), parent);
    } else if (node instanceof pt.IfStatement) {
        // TODO
    } else if (node instanceof pt.ForLoop) {
        // TODO
    } else if (node instanceof pt.WhileLoop) {
        // TODO
    } else if (node instanceof pt.DoWhileLoop) {
        // TODO
    } else if (node instanceof pt.ContinueStatement) {
        // TODO
    } else if (node instanceof pt.BreakStatement) {
        // TODO
    } else if (node instanceof pt.SwitchStatement) {
        // TODO
    } else if (node instanceof pt.CaseStatement) {
        // TODO
    } else if (node instanceof pt.DefaultStatement) {
        // TODO
    } else if (node instanceof pt.NoOp) {
        return new CNop(node, parent);
    }

    throw new ParseTreeValidationError(node, "Unknown statement type");
}

function ptCompound(node: pt.CompoundStatement, parent: CStatement | CFuncDefinition): CCompoundStatement {
    const c = parent instanceof CFuncDefinition ? parent.body : new CCompoundStatement(node, parent);
    for (const child of node.body) {
        if (child instanceof pt.Declaration) {
            for (const assignment of ptDeclaration(child, c.scope, true)) {
                // add initializers to body of the statement to ensure they happen in the correct order
                c.statements.push(new CExpressionStatement(assignment.node, assignment, c));
            }
        } else {
            c.statements.push(ptStatement(child, c));
        }
    }
    return c;
}

function getDeclaratorType(type: CType, declarator: pt.Declarator | pt.AbstractDeclarator, scope: Scope): CType {
    let d: pt.Declarator | pt.AbstractDeclarator | undefined = declarator;
    while (d && !(d instanceof pt.IdentifierDeclarator)) {
        if (d instanceof pt.PointerDeclarator || d instanceof pt.AbstractPointerDeclarator) {
            let ptr: pt.Pointer | undefined = d.pointer;
            while (ptr) {
                type = new CPointer(type, ptr.qualifierList?.includes("const"));
                ptr = ptr.body;
            }
            d = d.body;
        } else if (d instanceof pt.ArrayDeclarator || d instanceof pt.AbstractArrayDeclarator) {
            // need to support evaluating the constant expression to a number
            // and getting the length from the initializer
            throw new ParseTreeValidationError(declarator, "Not implemented"); // TODO
        } else { // d instanceof pt.(Abstract)FunctionDeclarator
            const parameterTypes = [];
            let parameterNames = undefined;

            for (const param of d.args ?? []) {
                let type = getSpecifierType(param.typeInfo, scope);
                if (param.declarator) type = getDeclaratorType(type, param.declarator, scope);
                if (param.typeInfo.qualifierList.length) type = addQualifier(type, param.typeInfo.qualifierList[0]);
                if (type instanceof CFuncType) {
                    throw new ParseTreeValidationError(param, "Functions cannot be parameters");
                }
                parameterTypes.push(type);

                if (param.declarator && !param.declarator.abstractDeclarator) {
                    parameterNames ??= [];
                    parameterNames.push(getDeclaratorName(param.declarator));
                }

                if (parameterNames && parameterNames.length !== parameterTypes.length) {
                    throw new ParseTreeValidationError(param, "Unexpected mix of abstract & non-abstract declarators");
                }
            }

            if (parameterTypes.length === 0) {
                // ensure parameterNames are always non-null in function definitions
                parameterNames = [];
            }

            if (d.body && !(d.body instanceof pt.IdentifierDeclarator)) {
                throw new ParseTreeValidationError(d.body, "Unexpected declarator");
            }
            return new CFuncType(type as CNotFuncType, parameterTypes, parameterNames);
        }
    }
    return type;
}

function getDeclaratorName(declarator: pt.Declarator | pt.InitDeclarator): string {
    while (!(declarator instanceof pt.IdentifierDeclarator)) {
        declarator = declarator.body;
    }
    return declarator.id;
}

function getSpecifierType(d: pt.SpecifierQualifiers | pt.DeclarationSpecifiers, scope: Scope): CType {
    const specifiers = d.specifierList;
    if (specifiers.every(x => typeof x === 'string')) {
        // basic type
        const type = getArithmeticType(specifiers as ReadonlyArray<pt.TypeSpecifier & string>);
        if (type) return type;
        throw new ParseTreeValidationError(d, "Invalid arithmetic type");
    }
    // support struct, union, enum
    throw new ParseTreeValidationError(d, "Not implemented"); // TODO
}
