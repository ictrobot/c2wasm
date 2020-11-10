import {CFuncDefinition} from "../tree/declarations";
import * as c from "../tree/statements";
import {WFunctionBuilder, Instructions} from "../wasm";
import {WExpression} from "../wasm/instructions";
import {subExpr} from "./expressions";
import {WGenerator} from "./generator";

function _compoundStatement(m: WGenerator, s: c.CCompoundStatement, b: WFunctionBuilder): WExpression {
    // TODO deal with locals etc
    return s.statements.flatMap(s2 => statementGeneration(m, s2, b));
}

function _expressionStatement(m: WGenerator, s: c.CExpressionStatement, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: _expressionStatement");
}

function _nop(m: WGenerator, s: c.CNop, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: _nop");
}

function _if(m: WGenerator, s: c.CIf, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: _if");
}

function _forLoop(m: WGenerator, s: c.CForLoop, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: _forLoop");
}

function _whileLoop(m: WGenerator, s: c.CWhileLoop, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: _whileLoop");
}

function _doLoop(m: WGenerator, s: c.CDoLoop, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: _doLoop");
}

function _switch(m: WGenerator, s: c.CSwitch, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: _switch");
}

function _continue(m: WGenerator, s: c.CContinue, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: _continue");
}

function _break(m: WGenerator, s: c.CBreak, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: _break");
}

function _return(m: WGenerator, s: c.CReturn, b: WFunctionBuilder): WExpression {
    if (s.value !== undefined) {
        return [...subExpr(m, s.value, b, s.func.type.returnType), ...isNested(s) ? [Instructions.return()] : []];
    }
    return isNested(s) ? [Instructions.return()] : [];
}

export function statementGeneration(m: WGenerator, s: c.CStatement, b: WFunctionBuilder): WExpression {
    if (s instanceof c.CCompoundStatement) return _compoundStatement(m, s, b);
    else if (s instanceof c.CExpressionStatement) return _expressionStatement(m, s, b);
    else if (s instanceof c.CNop) return _nop(m, s, b);
    else if (s instanceof c.CIf) return _if(m, s, b);
    else if (s instanceof c.CForLoop) return _forLoop(m, s, b);
    else if (s instanceof c.CWhileLoop) return _whileLoop(m, s, b);
    else if (s instanceof c.CDoLoop) return _doLoop(m, s, b);
    else if (s instanceof c.CSwitch) return _switch(m, s, b);
    else if (s instanceof c.CContinue) return _continue(m, s, b);
    else if (s instanceof c.CBreak) return _break(m, s, b);
    else return _return(m, s, b);
}

// helpers
function isNested(s: c.CStatement) {
    return !(s.parent instanceof c.CCompoundStatement && s.parent.parent instanceof CFuncDefinition);
}
