import {CFuncDefinition} from "../tree/declarations";
import * as c from "../tree/statements";
import {CArithmetic} from "../tree/types";
import {Instructions, i32Type} from "../wasm";
import {labelidx} from "../wasm/base_types";
import {WExpression, WInstruction} from "../wasm/instructions";
import {subExpr, condition, expressionGeneration, gInstr} from "./expressions";
import {GenError} from "./gen_error";
import {WFnGenerator} from "./generator";
import {storageSetupScope} from "./storage";
import {valueType} from "./type_conversion";

function _compoundStatement(ctx: WFnGenerator, s: c.CCompoundStatement): WExpression {
    const instr = storageSetupScope(ctx, s.scope);
    const body = s.statements.flatMap(s2 => statementGeneration(ctx, s2));
    body.unshift(...instr);
    return body;
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
    if (s.body === undefined) throw new GenError("Invalid for loop body", ctx, s.node);
    const storageSetup = storageSetupScope(ctx, s.scope);

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
        ...storageSetup,
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
    if (s.body === undefined) throw new GenError("Invalid while loop body", ctx, s.node);

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
    if (s.body === undefined) throw new GenError("Invalid while loop body", ctx, s.node);

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
    const defaultIndex = s.children.findIndex(x => x.default);
    if (defaultIndex !== -1 && defaultIndex !== s.children.length - 1) {
        throw new GenError("Only switch statements were the default block is the last block are supported");
    }

    const type = valueType(s.expression.type as CArithmetic);
    const body: WExpression = ctx.withTemporaryLocal(type, value => ctx.withTemporaryLocal(i32Type, matched => {
        const instr: WExpression = [
            ...expressionGeneration(ctx, s.expression, false),
            Instructions.local.set(value),
            Instructions.i32.const(0),
            Instructions.local.set(matched) // ALWAYS remember to reset temporary variables before use
        ];

        for (const child of s.children) {
            // condition
            if (child.default) {
                instr.push(Instructions.i32.const(1));
            } else {
                instr.push(Instructions.local.get(matched)); // TODO short circuit

                for (const sCase of child.cases) {
                    instr.push(Instructions.local.get(value), ...subExpr(ctx, sCase, s.expression.type), gInstr(type, "eq"));
                    instr.push(Instructions.i32.or());
                }
            }

            // body
            instr.push(Instructions.if(null, [
                Instructions.i32.const(1),
                Instructions.local.set(matched),
                ...ctx.statement(child.body)
            ]));
        }

        return instr;
    }));

    return [Instructions.block(null, [storeBreakDepth(s), ...body])];
}

function _continue(ctx: WFnGenerator, s: c.CContinue): WExpression {
    return [Instructions.br({
        getIndex(depth: number): labelidx {
            const statement = s.loop as any as Record<typeof continueDepthSymbol, number | undefined>;
            const targetDepth = statement[continueDepthSymbol];
            if (targetDepth === undefined) throw new GenError("Failed to find continue depth", ctx, s.node);

            return BigInt(depth - targetDepth) as labelidx;
        }
    })];
}

function _break(ctx: WFnGenerator, s: c.CBreak): WExpression {
    return [Instructions.br({
        getIndex(depth: number): labelidx {
            const statement = s.target as any as Record<typeof breakDepthSymbol, number | undefined>;
            const targetDepth = statement[breakDepthSymbol];
            if (targetDepth === undefined) throw new GenError("Failed to find break depth", ctx, s.node);

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
