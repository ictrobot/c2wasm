import type * as pt from "../parsing/parsetree";
import type {CFuncDefinition, CVariable} from "./declarations";
import {CExpression, CConstant, CAssignment} from "./expressions";
import {Scope} from "./scope";
import {ExpressionTypeError, asArithmeticOrPointer} from "./type_checking";

// classes to represent the various C statements in the IR
export type CStatement =
    CCompoundStatement | CExpressionStatement | CNop |
    CIf | CForLoop | CWhileLoop | CDoLoop | CSwitch |
    CContinue | CBreak | CReturn;

export class CCompoundStatement {
    readonly scope: Scope;
    readonly statements: CStatement[] = [];

    constructor(readonly node: pt.ParseNode, readonly parent: CStatement | CFuncDefinition) {
        this.scope = new Scope(node, parent.scope);
    }
}

export class CExpressionStatement {
    constructor(readonly node: pt.ParseNode, readonly expression: CExpression, readonly parent: CStatement) {
    }

    get scope(): Scope {
        return this.parent.scope;
    }
}

export class CNop {
    constructor(readonly node: pt.NoOp, readonly parent: CStatement) {
    }

    get scope(): Scope {
        return this.parent.scope;
    }
}

export class CIf {
    ifBody?: CStatement;
    elseBody?: CStatement;

    constructor(readonly node: pt.IfStatement, readonly test: CExpression, readonly parent: CStatement) {
        asArithmeticOrPointer(test.node, test.type);
    }

    get scope(): Scope {
        return this.parent.scope;
    }
}

export class CForLoop {
    init?: CExpressionStatement | CExpressionStatement[] | CNop;
    test?: CExpressionStatement | CNop;
    update?: CExpression;
    body?: CStatement;

    readonly scope: Scope; // own scope for init variable

    constructor(readonly node: pt.ForLoop, readonly parent: CStatement) {
        this.scope = new Scope(node, parent.scope);
    }
}

export class CWhileLoop {
    body?: CStatement;

    constructor(readonly node: pt.WhileLoop, readonly test: CExpression, readonly parent: CStatement) {
        asArithmeticOrPointer(test.node, test.type);
    }

    get scope(): Scope {
        return this.parent.scope;
    }
}

export class CDoLoop {
    body?: CStatement;

    constructor(readonly node: pt.DoWhileLoop, readonly test: CExpression, readonly parent: CStatement) {
        asArithmeticOrPointer(test.node, test.type);
    }

    get scope(): Scope {
        return this.parent.scope;
    }
}

export class CSwitch {
    children: {cases: CConstant[], body: CCompoundStatement, default: boolean}[] = [];

    constructor(readonly node: pt.SwitchStatement, readonly expression: CExpression, readonly parent: CStatement) {
    }

    get scope(): Scope {
        return this.parent.scope;
    }
}

export class CContinue {
    constructor(readonly node: pt.ContinueStatement,
                readonly loop: CForLoop | CWhileLoop | CDoLoop,
                readonly parent: CStatement) {
    }

    get scope(): Scope {
        return this.parent.scope;
    }
}

export class CBreak {
    constructor(readonly node: pt.BreakStatement,
                readonly target: CForLoop | CWhileLoop | CDoLoop | CSwitch,
                readonly parent: CStatement) {
    }

    get scope(): Scope {
        return this.parent.scope;
    }
}

export class CReturn {
    constructor(readonly node: pt.ReturnStatement,
                readonly func: CFuncDefinition,
                public value: CExpression | undefined,
                readonly parent: CStatement) {

        if (value === undefined) {
            if (func.type.returnType.bytes > 0) {
                // function return type is not void but a value was not provided
                throw new ExpressionTypeError(node, "`return [expression]`", "`return;`");
            }
        } else {
            if (!func.type.returnType.equals(value.type)) {
                // check provided return value matches the function's return type
                CAssignment.checkAssignmentValid(node, func.type.returnType, value);
            }
        }
    }

    get scope(): Scope {
        return this.parent.scope;
    }
}
