import {CFuncDefinition, CArgument, CFuncDeclaration, CVarDefinition, CVarDeclaration} from "../declarations";
import {CAssignment, CIdentifier, CExpression, CInitializer, CStringLiteral, CConstant, CArrayPointer} from "../expressions";
import {INTERNAL_SCOPE} from "../internal_scope";
import {Scope} from "../scope";
import {CStatement, CCompoundStatement, CExpressionStatement, CNop, CIf, CForLoop, CWhileLoop, CDoLoop, CSwitch, CBreak, CContinue, CReturn} from "../statements";
import {ExpressionTypeError} from "../type_checking";
import {CFuncType, CVoid, CArray, CArithmetic, CPointer} from "../types";
import {ParseTreeValidationError, pt} from "../../parsing";
import {ptExpression, evalIntegerConstant} from "./expr_transform";
import {getDeclaratorName, getDeclaratorType, getType} from "./type_transform";

/** Main function, transform a parse tree translation unit into a root scope */
export function ptTransform(translationUnit: pt.TranslationUnit): Scope {
    const fileScope = new Scope(undefined, INTERNAL_SCOPE);
    for (const decl of translationUnit) {
        if (decl instanceof pt.FunctionDefinition) {
            ptFunction(decl, fileScope);
        } else {
            ptDeclaration(decl, fileScope, false);
        }
    }
    return fileScope;
}

/** Add the pt declarations to the scope, and either store their static initializer on the variables or return a
 * list of assignments to add to the body of the current function to set their initial values */
function ptDeclaration(declaration: pt.Declaration, scope: Scope, inFunction: boolean): CAssignment[] {
    if (declaration.typeInfo.storageList[0] === "typedef") {
        ptTypedef(declaration, scope);
        return [];
    }

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
        if (!(type instanceof CPointer) && initialValue instanceof CArrayPointer && initialValue.arrayIdentifier instanceof CStringLiteral) {
            initialValue = initialValue.arrayIdentifier;
        }
        if (initialValue?.type instanceof CArray && type instanceof CArray && type.incomplete) {
            // initialize array length from initializer if incomplete
            type.length = initialValue.type.length;
        }

        if (type.incomplete) {
            throw new ExpressionTypeError(type.node ?? entry, "complete type", "incomplete type");
        } else if (type instanceof CFuncType) {
            // function declarations
            const linkage = declaration.typeInfo.storageList[0] === "static" ? "internal" : "external";
            const fnImport = declaration.typeInfo.fnSpecifierList[0] === "import";
            scope.addIdentifier(new CFuncDeclaration(entry, name, type, linkage, fnImport));
        } else {
            if (declaration.typeInfo.fnSpecifierList.length > 0) {
                throw new ExpressionTypeError(entry, "variable declaration with function specifier");
            }

            // work out storage, linkage and if definition or declaration
            let storage: "static" | "local";
            let linkage: "none" | "internal" | "external";
            let declType: typeof CVarDefinition | typeof CVarDeclaration;
            if (declaration.typeInfo.storageList[0] === "static") {
                storage = "static";
                linkage = inFunction ? "none" : "internal";
                declType = inFunction ? CVarDefinition : (initialValue !== undefined ? CVarDefinition : CVarDeclaration);
            } else if (declaration.typeInfo.storageList[0] === "extern") {
                storage = "static";
                linkage = "external";
                declType = CVarDeclaration;
            } else {
                storage = inFunction ? "local" : "static";
                linkage = inFunction ? "none" : "external";
                declType = inFunction ? CVarDefinition : (initialValue !== undefined ? CVarDefinition : CVarDeclaration);
            }
            const cvar = new declType(entry, name, type, storage, linkage);
            scope.addIdentifier(cvar);

            // if definition with initializer
            if (initialValue) {
                if (cvar instanceof CVarDeclaration) {
                    throw new ExpressionTypeError(entry, "declaration", "declaration with initializer");
                }
                if (initialValue instanceof CInitializer) {
                    initialValue.type = type;
                }
                if (initialValue instanceof CConstant && type instanceof CArithmetic && type !== initialValue.type) {
                    // force constants to take the correct type
                    initialValue = initialValue.changeType(type);
                }

                if (inFunction && cvar.storage !== "static") {
                    const id: CExpression = new CIdentifier(entry, cvar);
                    assignments.push(new CAssignment(entry, id, initialValue, undefined, true));
                } else {
                    // static initialization, must be constant and evaluated at compile time
                    cvar.staticValue = initialValue;
                    CAssignment.checkAssignmentValid(entry, type, cvar.staticValue);

                    // setup variable dependencies
                    for (const identifier of initialValue.identifiers()) {
                        cvar.dependencies.set(identifier.value, true);
                    }
                }
            }
        }
    }
    return assignments;
}

function ptTypedef(node: pt.Declaration, scope: Scope) {
    if (node.list.length === 0) throw new ParseTreeValidationError(node, "typedef must define at least one identifier");
    const baseType = getType(node, scope);

    for (const decl of node.list) {
        if (decl instanceof pt.InitDeclarator) throw new ParseTreeValidationError(node, "cannot initialize a typedef");
        const type = getDeclaratorType(baseType, decl, scope);
        const name = getDeclaratorName(decl);
        scope.addTypedef(name, type, decl);
    }
}

/** Transform an initializer to either a CInitializer (for arrays, structs & unions) or a CExpression */
function ptInitializer(node: pt.ParseNode, initializer: pt.Initializer, scope: Scope): CExpression | CInitializer {
    if (Array.isArray(initializer)) {
        return new CInitializer(node, initializer.map(x => ptInitializer(node, x, scope)));
    } else {
        return ptExpression(initializer as pt.Expression, scope);
    }
}

/** Transform a function */
function ptFunction(fn: pt.FunctionDefinition, scope: Scope): void {
    if (fn.typeInfo.fnSpecifierList[0] === "import") {
        throw new ExpressionTypeError(fn, "function definition to not be marked `import`");
    }

    // get and check the function's type
    const type = getType(fn, scope);
    if (!(type instanceof CFuncType)) throw new ParseTreeValidationError(fn, "Unexpected declarator");
    // get the function name
    const name = getDeclaratorName(fn.declarator);

    let linkage: "internal" | "external";
    if (fn.typeInfo.storageList[0] === "static") linkage = "internal";
    else if (fn.typeInfo.storageList[0] === "typedef") throw new ParseTreeValidationError(fn, "Invalid typedef");
    else linkage = "external";

    const cfn = new CFuncDefinition(fn, name, type, linkage, scope);
    scope.addIdentifier(cfn);

    // add arguments as parameters to function's scope
    if (!type.parameterNames) throw new ParseTreeValidationError(fn, "Expected parameter names");
    for (let i = 0; i < type.parameterTypes.length; i++) {
        cfn.body.scope.addIdentifier(new CArgument(fn, type.parameterNames[i], type.parameterTypes[i], i));
    }

    // parse function body body
    ptCompound(fn.body, cfn);

    // check function always returns
    if (!(type.returnType instanceof CVoid) && !checkReturns(cfn.body)) {
        throw new ParseTreeValidationError(fn.body, "Non-void function may not return");
    }
}

/** Checks every branch through a function will definitely return */
function checkReturns(statement: CStatement | undefined): boolean {
    if (statement instanceof CReturn) {
        return true;
    } else if (statement instanceof CCompoundStatement) {
        for (let i = 0; i < statement.statements.length; i++) {
            if (checkReturns(statement.statements[i])) {
                if (i !== statement.statements.length - 1) {
                    // we've found a return inside the compound statement but it's not at the end, so there are statements
                    // which will never be executed
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

/** Transform statements from the parse tree */
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
        let p: CStatement = parent; // find which statement this node is continuing
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
        ptSwitchBody(s, node, parent.scope);
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

/** Transform compound statements */
function ptCompound(node: pt.CompoundStatement, parent: CStatement | CFuncDefinition): CCompoundStatement {
    const c = parent instanceof CFuncDefinition ? parent.body : new CCompoundStatement(node, parent);
    for (const child of node.body) _compoundBody(child, c);
    return c;
}

/** Transform a declaration or statement inside a compound statement */
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

/** Transform the body of a switch statement.
 *
 * This is quite complicated as case & default statements both absorb the following statement.
 * Furthermore, these statements are limited to being used at the top level inside the switch statement, whereas in C
 * you can place them inside other statements inside the switch block, creating arbitrary goto which is out of scope.
 */
function ptSwitchBody(s: CSwitch, node: pt.SwitchStatement, scope: Scope) {
    if (!(node.body instanceof pt.CompoundStatement)) {
        throw new ParseTreeValidationError(node, "Expected switch statement to have a compound statement body");
    }
    const children = node.body.body.slice();
    while (children.length > 0) { // iterate over the body of the switch statement
        const child = children.shift();
        if (child instanceof pt.CaseStatement || child instanceof pt.DefaultStatement) {
            let block;
            if (s.children.length > 0 && s.children[s.children.length - 1].body.statements.length === 0) {
                // multiple cases in a row, use the last defined block
                block = s.children[s.children.length - 1];
            } else {
                // last block already has children, make a new block
                block = {cases: [], default: false, body: new CCompoundStatement(node, s)};
                s.children.push(block);
            }

            if (child instanceof pt.CaseStatement) { // add the case or mark this block as accepting default
                block.cases.push(evalIntegerConstant(child.value, scope));
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
