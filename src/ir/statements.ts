import type * as pt from "../parsing/parsetree";
import type {CFunction, CVariable} from "./declarations";
import type {CExpression, IntegerConstant} from "./expressions";
import {Scope} from "./scope";

export type CStatement =
    CCompoundStatement | CExpressionStatement | CNop |
    CIf | CForLoop | CWhileLoop | CDoLoop | CSwitch |
    CContinue | CBreak | CReturn;

export class CCompoundStatement {
    readonly scope: Scope;
    readonly statements: CStatement[] = [];
    readonly variables: CVariable[] = [];

    constructor(readonly node: pt.CompoundStatement, readonly parent: CStatement | CFunction) {
        this.scope = new Scope(node, parent.scope);
    }
}

export class CExpressionStatement {
    constructor(readonly node: pt.ExpressionStatement, readonly expression: CExpression, readonly parent: CStatement) {
    }

    get scope(): Scope {
        return this.parent.scope;
    }
}

export class CNop {
    constructor(readonly node: pt.NoOp, readonly parent: CCompoundStatement) {
    }

    get scope(): Scope {
        return this.parent.scope;
    }
}

export class CIf {
    ifBody?: CStatement;
    elseBody?: CStatement;

    constructor(readonly node: pt.IfStatement, readonly test: CExpression, readonly parent: CStatement) {
    }

    get scope(): Scope {
        return this.parent.scope;
    }
}

export class CForLoop {
    init?: CExpressionStatement | CNop | CVariable;
    test?: CExpressionStatement;
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
    }

    get scope(): Scope {
        return this.parent.scope;
    }
}

export class CDoLoop {
    body?: CStatement;

    constructor(readonly node: pt.DoWhileLoop, readonly test: CExpression, readonly parent: CStatement) {
    }

    get scope(): Scope {
        return this.parent.scope;
    }
}

export class CSwitch {
    children: {cases: IntegerConstant[], body: CStatement[], default: boolean}[] = [];

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
                readonly func: CFunction,
                readonly parent: CStatement) {
    }

    get scope(): Scope {
        return this.parent.scope;
    }
}
