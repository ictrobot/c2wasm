import {CFuncDefinition} from "../tree/declarations";
import * as c from "../tree/statements";
import {Instructions} from "../wasm";
import {labelidx} from "../wasm/base_types";
import {WExpression, WInstruction} from "../wasm/instructions";
import {subExpr, condition} from "./expressions";
import {WFnGenerator} from "./generator";
import {storageSetupScope} from "./storage";

function _compoundStatement(ctx: WFnGenerator, s: c.CCompoundStatement): WExpression {
    storageSetupScope(ctx, s.scope);
    return s.statements.flatMap(s2 => statementGeneration(ctx, s2));
}

function _expressionStatement(ctx: WFnGenerator, s: c.CExpressionStatement): WExpression {
    return ctx.expression(s.expression, true);
}

function _nop(ctx: WFnGenerator, s: c.CNop): WExpression {
    return []; // [Instructions.nop()]
}

function _if(ctx: WFnGenerator, s: c.CIf): WExpression {
    const ifBody = s.ifBody === undefined ? [Instructions.nop()] : statementGeneration(ctx, s.ifBody);
    const elseBody = s.elseBody === undefined ? undefined : statementGeneration(ctx, s.elseBody);

    return [...condition(ctx, s.test), Instructions.if(null, ifBody, elseBody)];
}

function _forLoop(ctx: WFnGenerator, s: c.CForLoop): WExpression {
    if (s.body === undefined) throw new Error("Invalid for loop body");
    storageSetupScope(ctx, s.scope);

    let init: WExpression = [];
    if (Array.isArray(s.init)) {
        init = s.init.flatMap(e => ctx.expression(e.expression, true));
    } else if (s.init !== undefined && !(s.init instanceof c.CNop)) {
        init = ctx.expression(s.init.expression, true);
    }

    let test: WExpression = [Instructions.i32.const(1n)];
    if (s.test !== undefined && !(s.test instanceof c.CNop)) {
        test = condition(ctx, s.test.expression);
    }

    let update: WExpression = [];
    if (s.update !== undefined) update = ctx.expression(s.update, true);

    return [
        ...init,
        Instructions.loop(null, [
            ...test,
            Instructions.if(null, [
                storeBreakDepth(s),
                Instructions.block(null, [
                    storeContinueDepth(s),
                    ...statementGeneration(ctx, s.body),
                ]),
                ...update,
                Instructions.br(1) // jump back to start of loop
            ])
        ])
    ];
}

function _whileLoop(ctx: WFnGenerator, s: c.CWhileLoop): WExpression {
    if (s.body === undefined) throw new Error("Invalid while loop body");

    return [Instructions.loop(null, [
        storeContinueDepth(s),
        ...condition(ctx, s.test),
        Instructions.if(null, [
            storeBreakDepth(s),
            ...statementGeneration(ctx, s.body),
            Instructions.br(1) // jump back to start of loop
        ])
    ])];
}

function _doLoop(ctx: WFnGenerator, s: c.CDoLoop): WExpression {
    if (s.body === undefined) throw new Error("Invalid while loop body");

    return [Instructions.block(null, [
        storeBreakDepth(s),
        Instructions.loop(null, [
            storeContinueDepth(s),

            ...statementGeneration(ctx, s.body),
            ...condition(ctx, s.test),
            Instructions.br_if(0)])]
    )];
}

function _switch(ctx: WFnGenerator, s: c.CSwitch): WExpression {
    throw new Error("TODO: _switch");
}

function _continue(ctx: WFnGenerator, s: c.CContinue): WExpression {
    return [Instructions.br({
        getIndex(depth: number): labelidx {
            const statement = s.loop as any as Record<typeof continueDepthSymbol, number | undefined>;
            const targetDepth = statement[continueDepthSymbol];
            if (targetDepth === undefined) throw new Error("Failed to find continue depth");

            return BigInt(depth - targetDepth) as labelidx;
        }
    })];
}

function _break(ctx: WFnGenerator, s: c.CBreak): WExpression {
    return [Instructions.br({
        getIndex(depth: number): labelidx {
            const statement = s.target as any as Record<typeof breakDepthSymbol, number | undefined>;
            const targetDepth = statement[breakDepthSymbol];
            if (targetDepth === undefined) throw new Error("Failed to find break depth");

            return BigInt(depth - targetDepth) as labelidx;
        }
    })];
}

function _return(ctx: WFnGenerator, s: c.CReturn): WExpression {
    if (s.value !== undefined) {
        return [...subExpr(ctx, s.value, s.func.type.returnType), Instructions.return()];
    }
    return [Instructions.return()];
}

export function statementGeneration(ctx: WFnGenerator, s: c.CStatement): WExpression {
    if (s instanceof c.CCompoundStatement) return _compoundStatement(ctx, s);
    else if (s instanceof c.CExpressionStatement) return _expressionStatement(ctx, s);
    else if (s instanceof c.CNop) return _nop(ctx, s);
    else if (s instanceof c.CIf) return _if(ctx, s);
    else if (s instanceof c.CForLoop) return _forLoop(ctx, s);
    else if (s instanceof c.CWhileLoop) return _whileLoop(ctx, s);
    else if (s instanceof c.CDoLoop) return _doLoop(ctx, s);
    else if (s instanceof c.CSwitch) return _switch(ctx, s);
    else if (s instanceof c.CContinue) return _continue(ctx, s);
    else if (s instanceof c.CBreak) return _break(ctx, s);
    else return _return(ctx, s);
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
