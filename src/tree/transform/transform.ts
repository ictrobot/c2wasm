import {CVariable, CFuncDefinition, CArgument, CFuncDeclaration} from "../declarations";
import {CAssignment, CIdentifier, CExpression, CEvaluable, CInitializer, CStringLiteral} from "../expressions";
import {Scope} from "../scope";
import {CStatement, CCompoundStatement, CExpressionStatement, CNop, CIf, CForLoop, CWhileLoop, CDoLoop, CSwitch, CBreak, CContinue, CReturn} from "../statements";
import {ExpressionTypeError} from "../type_checking";
import {CFuncType, CVoid, CArray} from "../types";
import {ParseTreeValidationError, pt} from "../../parsing";
import {ptExpression, evalConstant} from "./expr_transform";
import {getDeclaratorName, getDeclaratorType, getType} from "./type_transform";

export function ptTransform(translationUnit: pt.TranslationUnit): Scope {
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
    const declType = getType(declaration, scope);
    const assignments = [];
    for (let entry of declaration.list) {
        const name = getDeclaratorName(entry);

        let initialValue: CExpression | CInitializer | undefined;
        if (entry instanceof pt.InitDeclarator) {
            initialValue = ptInitializer(entry, entry.initializer, scope);
            entry = entry.body;
        }

        const type = getDeclaratorType(declType, entry, scope);
        if (initialValue?.type instanceof CArray && type instanceof CArray && type.incomplete) {
            // initialize array length from initializer if incomplete
            type.length = initialValue.type.length;
        }

        if (type.incomplete) {
            throw new ExpressionTypeError(type.node ?? entry, "complete type", "incomplete type");
        } else if (type instanceof CFuncType) {
            // function declarations
            scope.addIdentifier(new CFuncDeclaration(entry, name, type, declaration.typeInfo.storageList[0]));
        } else {
            // variable
            const cvar = new CVariable(entry, name, type, declaration.typeInfo.storageList[0]);
            scope.addIdentifier(cvar);

            if (initialValue) {
                if (initialValue instanceof CInitializer) initialValue.type = type;

                if (inFunction && cvar.storage !== "static") {
                    const id = new CIdentifier(entry, cvar);
                    assignments.push(new CAssignment(entry, id, initialValue, undefined, true));
                } else {
                    // static initialization, must be constant and evaluated at compile time
                    if (initialValue instanceof CEvaluable) {
                        cvar.staticValue = initialValue.evaluate();
                    } else if (initialValue instanceof CInitializer) {
                        cvar.staticValue = initialValue.asStatic();
                    } else if (initialValue instanceof CStringLiteral) {
                        cvar.staticValue = initialValue.toInitializer();
                    } else {
                        throw new ExpressionTypeError(initialValue.node, "constant expression", "non-constant expression");
                    }
                    CAssignment.checkAssignmentValid(entry, type, cvar.staticValue);
                }
            }
        }
    }
    return assignments;
}

function ptInitializer(node: pt.ParseNode, initializer: pt.Initializer, scope: Scope): CExpression | CInitializer {
    if (Array.isArray(initializer)) {
        return new CInitializer(node, initializer.map(x => ptInitializer(node, x, scope)));
    } else {
        return ptExpression(initializer as pt.Expression, scope);
    }
}

function ptFunction(fn: pt.FunctionDefinition, scope: Scope): void {
    // fn type
    const type = getType(fn, scope);
    if (!(type instanceof CFuncType)) throw new ParseTreeValidationError(fn, "Unexpected declarator");
    // fn name
    const name = getDeclaratorName(fn.declarator);

    const cfn = new CFuncDefinition(fn, name, type, fn.typeInfo.storageList[0], scope);
    scope.addIdentifier(cfn);

    // add arguments as parameters to function's scope
    if (!type.parameterNames) throw new ParseTreeValidationError(fn, "Expected parameter names");
    for (let i = 0; i < type.parameterTypes.length; i++) {
        cfn.body.scope.addIdentifier(new CArgument(fn, type.parameterNames[i], type.parameterTypes[i]));
    }

    // parse body
    ptCompound(fn.body, cfn);

    // check function always returns
    if (!(type.returnType instanceof CVoid) && !checkReturns(cfn.body)) {
        throw new ParseTreeValidationError(fn.body, "Non-void function may not return");
    }
}

function checkReturns(statement: CStatement | undefined): boolean {
    if (statement instanceof CReturn) {
        return true;
    } else if (statement instanceof CCompoundStatement) {
        for (let i = 0; i < statement.statements.length; i++) {
            if (checkReturns(statement.statements[i])) {
                if (i !== statement.statements.length - 1) {
                    throw new ParseTreeValidationError(statement.statements[i + 1].node, "Statement after return");
                }
                return true;
            }
        }
    } else if (statement instanceof CIf) {
        return checkReturns(statement.ifBody) && checkReturns(statement.elseBody);
    } else if (statement instanceof CDoLoop) {
        return checkReturns(statement.body);
    } else if (statement instanceof CSwitch) {
        // if every child returns and there's a default statement then switch is safe
        return statement.children.every(x => checkReturns(x.body)) &&
            statement.children.find(x => x.default) !== undefined;
    }
    return false;
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
