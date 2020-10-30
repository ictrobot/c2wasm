import {CVariable, CFuncDefinition, CArgument, CFuncDeclaration} from "../ir/declarations";
import {CAssignment, CIdentifier} from "../ir/expressions";
import {Scope} from "../ir/scope";
import {CStatement, CCompoundStatement, CExpressionStatement, CNop, CIf, CForLoop, CWhileLoop, CDoLoop, CSwitch, CBreak, CContinue, CReturn} from "../ir/statements";
import {CFuncType, addQualifier} from "../ir/types";
import * as pt from "../parsing/parsetree";
import {ParseTreeValidationError} from "../parsing/validation";
import {ptExpression, evalConstant} from "./expr_transform";
import {getSpecifierType, getDeclaratorName, getDeclaratorType, getType} from "./type_transform";

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
    let type = getType(fn, scope);
    if (!(type instanceof CFuncType)) throw new ParseTreeValidationError(fn, "Unexpected declarator");
    type = addQualifier(type, fn.typeInfo.qualifierList[0]);
    // fn name
    const name = getDeclaratorName(fn.declarator);

    const cfn = new CFuncDefinition(name, type, fn.typeInfo.storageList[0], fn, scope);
    scope.addIdentifier(cfn);

    // add arguments as parameters to function's scope
    if (!type.parameterNames) throw new ParseTreeValidationError(fn, "Expected parameter names");
    for (let i = 0; i < type.parameterTypes.length; i++) {
        cfn.body.scope.addIdentifier(new CArgument(type.parameterNames[i], type.parameterTypes[i]));
    }

    // parse body
    ptCompound(fn.body, cfn);
}

function ptStatement(node: pt.Statement, parent: CStatement): CStatement {
    if (node instanceof pt.CompoundStatement) {
        return ptCompound(node, parent);

    } else if (node instanceof pt.ExpressionStatement) {
        return new CExpressionStatement(node, ptExpression(node.expression, parent.scope), parent);

    } else if (node instanceof pt.IfStatement) {
        const s = new CIf(node, ptExpression(node.expression, parent.scope), parent);
        s.ifBody = ptStatement(node.ifBody, s);
        if (node.elseBody) s.elseBody = ptStatement(node.elseBody, s);
        return s;

    } else if (node instanceof pt.ForLoop) {
        const s = new CForLoop(node, parent);
        if (node.init instanceof pt.ExpressionStatement || node.init instanceof pt.NoOp) {
            s.init = ptStatement(node.init, s) as CExpressionStatement | CNop;
        } else {
            s.init = ptDeclaration(node.init, s.scope, true)
                .map(e => new CExpressionStatement(e.node, e, s));
        }
        s.test = ptStatement(node.test, s) as CExpressionStatement | CNop;
        if (node.update) s.update = ptExpression(node.update, s.scope);
        s.body = ptStatement(node.body, s);
        return s;

    } else if (node instanceof pt.WhileLoop) {
        const s = new CWhileLoop(node, ptExpression(node.test, parent.scope), parent);
        s.body = ptStatement(node.body, s);
        return s;

    } else if (node instanceof pt.DoWhileLoop) {
        const s = new CDoLoop(node, ptExpression(node.test, parent.scope), parent);
        s.body = ptStatement(node.body, s);
        return s;

    } else if (node instanceof pt.ContinueStatement) {
        let p: CStatement = parent;
        while (!(p instanceof CForLoop || p instanceof CWhileLoop || p instanceof CDoLoop)) {
            if (p.parent instanceof CFuncDefinition) {
                throw new ParseTreeValidationError(node, "No target for continue statement");
            }
            p = p.parent;
        }
        return new CContinue(node, p, parent);

    } else if (node instanceof pt.BreakStatement) {
        let p: CStatement = parent;
        while (!(p instanceof CForLoop || p instanceof CWhileLoop || p instanceof CDoLoop || p instanceof CSwitch)) {
            if (p.parent instanceof CFuncDefinition) {
                throw new ParseTreeValidationError(node, "No target for break statement");
            }
            p = p.parent;
        }
        return new CBreak(node, p, parent);

    } else if (node instanceof pt.SwitchStatement) {
        const s = new CSwitch(node, ptExpression(node.expression, parent.scope), parent);
        ptSwitchBody(s, node);
        return s;

    } else if (node instanceof pt.ReturnStatement) {
        let p: CStatement | CFuncDefinition = parent;
        while (!(p instanceof CFuncDefinition)) p = p.parent;

        const value = node.value ? ptExpression(node.value, parent.scope) : undefined;
        return new CReturn(node, p, value, parent);

    } else if (node instanceof pt.NoOp) {
        return new CNop(node, parent);

    } else if (node instanceof pt.CaseStatement) {
        // allowed case/default statements handled in ptSwitchBody
        throw new ParseTreeValidationError(node, "Unexpected case statement");
    } else if (node instanceof pt.DefaultStatement) {
        throw new ParseTreeValidationError(node, "Unexpected default statement");
    }

    throw new ParseTreeValidationError(node, "Unknown statement type");
}

function ptCompound(node: pt.CompoundStatement, parent: CStatement | CFuncDefinition): CCompoundStatement {
    const c = parent instanceof CFuncDefinition ? parent.body : new CCompoundStatement(node, parent);
    for (const child of node.body) _compoundBody(child, c);
    return c;
}

function _compoundBody(child: pt.Declaration | pt.Statement, c: CCompoundStatement) {
    if (child instanceof pt.Declaration) {
        for (const assignment of ptDeclaration(child, c.scope, true)) {
            // add initializers to body of the statement to ensure they happen in the correct order
            c.statements.push(new CExpressionStatement(assignment.node, assignment, c));
        }
    } else {
        c.statements.push(ptStatement(child, c));
    }
}

function ptSwitchBody(s: CSwitch, node: pt.SwitchStatement) {
    if (!(node.body instanceof pt.CompoundStatement)) {
        throw new ParseTreeValidationError(node, "Expected switch statement to have a compound statement body");
    }
    const children = node.body.body.slice();
    while (children.length > 0) {
        const child = children.shift();
        if (child instanceof pt.CaseStatement || child instanceof pt.DefaultStatement) {
            let block;
            if (s.children.length > 0 && s.children[s.children.length - 1].body.statements.length === 0) {
                // multiple cases in a row
                block = s.children[s.children.length - 1];
            } else {
                block = {cases: [], default: false, body: new CCompoundStatement(node, s)};
                s.children.push(block);
            }

            if (child instanceof pt.CaseStatement) {
                block.cases.push(evalConstant(child.value));
            } else {
                block.default = true;
            }

            // case and default statements eat a statement
            children.unshift(child.body);
        } else if (child) {
            // handle other statements as if this was a compound statement
            if (s.children.length === 0) {
                throw new ParseTreeValidationError(child, "Unexpected first statement inside a switch statement");
            }
            const compound = s.children[s.children.length - 1].body;
            _compoundBody(child, compound);
        }
    }
}
