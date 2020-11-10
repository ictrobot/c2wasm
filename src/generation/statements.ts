import {CFuncDefinition} from "../tree/declarations";
import * as c from "../tree/statements";
import {WFunctionBuilder, Instructions} from "../wasm";
import {labelidx} from "../wasm/base_types";
import {WExpression, WInstruction} from "../wasm/instructions";
import {subExpr, condition} from "./expressions";
import {WGenerator} from "./generator";
import {storageSetupScope} from "./storage";

function _compoundStatement(m: WGenerator, s: c.CCompoundStatement, b: WFunctionBuilder): WExpression {
    storageSetupScope(m, s.scope, b);
    return s.statements.flatMap(s2 => statementGeneration(m, s2, b));
}

function _expressionStatement(m: WGenerator, s: c.CExpressionStatement, b: WFunctionBuilder): WExpression {
    return m.expression(s.expression, true);
}

function _nop(m: WGenerator, s: c.CNop, b: WFunctionBuilder): WExpression {
    return []; // [Instructions.nop()]
}

function _if(m: WGenerator, s: c.CIf, b: WFunctionBuilder): WExpression {
    const ifBody = s.ifBody === undefined ? [Instructions.nop()] : statementGeneration(m, s.ifBody, b);
    const elseBody = s.elseBody === undefined ? undefined : statementGeneration(m, s.elseBody, b);

    return [...condition(m, s.test), Instructions.if(null, ifBody, elseBody)];
}

function _forLoop(m: WGenerator, s: c.CForLoop, b: WFunctionBuilder): WExpression {
    if (s.body === undefined) throw new Error("Invalid for loop body");
    storageSetupScope(m, s.scope, b);

    let init: WExpression = [];
    if (Array.isArray(s.init)) {
        init = s.init.flatMap(e => m.expression(e.expression, true));
    } else if (s.init !== undefined && !(s.init instanceof c.CNop)) {
        init = m.expression(s.init.expression, true);
    }

    let test: WExpression = [Instructions.i32.const(1n)];
    if (s.test !== undefined && !(s.test instanceof c.CNop)) {
        test = condition(m, s.test.expression);
    }

    let update: WExpression = [];
    if (s.update !== undefined) update = m.expression(s.update, true);

    return [
        ...init,
        Instructions.loop(null, [
            ...test,
            Instructions.if(null, [
                storeBreakDepth(s),
                Instructions.block(null, [
                    storeContinueDepth(s),
                    ...statementGeneration(m, s.body, b),
                ]),
                ...update,
                Instructions.br(1) // jump back to start of loop
            ])
        ])
    ];
}

function _whileLoop(m: WGenerator, s: c.CWhileLoop, b: WFunctionBuilder): WExpression {
    if (s.body === undefined) throw new Error("Invalid while loop body");

    return [Instructions.loop(null, [
        storeContinueDepth(s),
        ...condition(m, s.test),
        Instructions.if(null, [
            storeBreakDepth(s),
            ...statementGeneration(m, s.body, b),
            Instructions.br(1) // jump back to start of loop
        ])
    ])];
}

function _doLoop(m: WGenerator, s: c.CDoLoop, b: WFunctionBuilder): WExpression {
    if (s.body === undefined) throw new Error("Invalid while loop body");

    return [Instructions.block(null, [
        storeBreakDepth(s),
        Instructions.loop(null, [
            storeContinueDepth(s),

            ...statementGeneration(m, s.body, b),
            ...condition(m, s.test),
            Instructions.br_if(0)])]
    )];
}

function _switch(m: WGenerator, s: c.CSwitch, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: _switch");
}

function _continue(m: WGenerator, s: c.CContinue, b: WFunctionBuilder): WExpression {
    return [Instructions.br({
        getIndex(depth: number): labelidx {
            const statement = s.loop as any as Record<typeof continueDepthSymbol, number | undefined>;
            const targetDepth = statement[continueDepthSymbol];
            if (targetDepth === undefined) throw new Error("Failed to find continue depth");

            return BigInt(depth - targetDepth) as labelidx;
        }
    })];
}

function _break(m: WGenerator, s: c.CBreak, b: WFunctionBuilder): WExpression {
    return [Instructions.br({
        getIndex(depth: number): labelidx {
            const statement = s.target as any as Record<typeof breakDepthSymbol, number | undefined>;
            const targetDepth = statement[breakDepthSymbol];
            if (targetDepth === undefined) throw new Error("Failed to find break depth");

            return BigInt(depth - targetDepth) as labelidx;
        }
    })];
}

function _return(m: WGenerator, s: c.CReturn, b: WFunctionBuilder): WExpression {
    if (s.value !== undefined) {
        return [...subExpr(m, s.value, s.func.type.returnType), Instructions.return()];
    }
    return [Instructions.return()];
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

// break and continue depth helpers
const breakDepthSymbol = Symbol("break depth");
const continueDepthSymbol = Symbol("continue depth");

function storeBreakDepth<T extends c.CForLoop | c.CWhileLoop | c.CDoLoop | c.CSwitch>(s: T): WInstruction {
    const statement = s as Record<typeof breakDepthSymbol, any>;
    return (d : number) => {
        statement[breakDepthSymbol] = d;
        return [];
    };
}

function storeContinueDepth<T extends c.CForLoop | c.CWhileLoop | c.CDoLoop | c.CSwitch>(s: T): WInstruction {
    const statement = s as Record<typeof continueDepthSymbol, any>;
    return (d : number) => {
        statement[continueDepthSymbol] = d;
        return [];
    };
}
