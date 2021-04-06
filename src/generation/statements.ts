import {getFlags} from "../optimisation/flags";
import {CConstant} from "../ir/expressions";
import * as c from "../ir/statements";
import {CArithmetic, CPointer} from "../ir/types";
import {Instructions, i32Type, i64Type} from "../wasm";
import {labelidx} from "../wasm/base_types";
import {WInstruction} from "../wasm/instructions";
import {subExpr, condition, expressionGeneration, gInstr} from "./expressions";
import {GenError} from "./gen_error";
import {WFnGenerator} from "./generator";
import {storageSetupScope, memcpy} from "./storage";
import {valueType, largeReturn} from "./type_conversion";

function _compoundStatement(ctx: WFnGenerator, s: c.CCompoundStatement): WInstruction[] {
    const [instr, finishCallback] = storageSetupScope(ctx, s.scope);
    if (s.scope.labelledStatement === undefined) {
        instr.push(...s.statements.flatMap(s2 => statementGeneration(ctx, s2)));
    } else {
        // place all the instructions before the labelled statement in a block to enable jumping forward
        const blockStatements: c.CStatement[] = [];
        // place all the instructions after and including the labelled statement in a loop to enable jumping back
        const loopStatements: c.CStatement[] = [];
        for (const statement of s.statements) {
            if (loopStatements.length > 0 || s.scope.labelledStatement.body === statement) {
                loopStatements.push(statement);
            } else {
                blockStatements.push(statement);
            }
        }

        // only need to store the break depth once as they are at the same depth
        instr.push(
            Instructions.block(null, blockStatements.flatMap(s2 => statementGeneration(ctx, s2)), storeBreakDepth(s.scope.labelledStatement)),
            Instructions.loop(null, loopStatements.flatMap(s2 => statementGeneration(ctx, s2)))
        );
    }
    finishCallback();
    return instr;
}

function _expressionStatement(ctx: WFnGenerator, s: c.CExpressionStatement): WInstruction[] {
    return ctx.expression(s.expression, true);
}

function _nop(ctx: WFnGenerator, s: c.CNop): WInstruction[] {
    return []; // [Instructions.nop()]
}

function _if(ctx: WFnGenerator, s: c.CIf): WInstruction[] {
    const ifBody = s.ifBody === undefined ? [Instructions.nop()] : statementGeneration(ctx, s.ifBody);
    const elseBody = s.elseBody === undefined ? undefined : statementGeneration(ctx, s.elseBody);

    return [...condition(ctx, s.test), Instructions.if(null, ifBody, elseBody)];
}

function _forLoop(ctx: WFnGenerator, s: c.CForLoop): WInstruction[] {
    if (s.body === undefined) throw new GenError("Invalid for loop body", ctx, s.node);
    const [instr, storageFinishCallback] = storageSetupScope(ctx, s.scope);

    let init: WInstruction[] = [];
    if (Array.isArray(s.init)) {
        init = s.init.flatMap(e => ctx.expression(e.expression, true));
    } else if (s.init !== undefined && !(s.init instanceof c.CNop)) {
        init = ctx.expression(s.init.expression, true);
    }

    let test: WInstruction[] = [Instructions.i32.const(1n)];
    if (s.test !== undefined && !(s.test instanceof c.CNop)) {
        test = condition(ctx, s.test.expression);
    }

    let update: WInstruction[] = [];
    if (s.update !== undefined) update = ctx.expression(s.update, true);

    instr.push(...init,
        Instructions.loop(null, [
            ...test,
            Instructions.if(null, [
                Instructions.block(null, [
                    ...statementGeneration(ctx, s.body),
                ], storeContinueDepth(s)),
                ...update,
                Instructions.br(1) // jump back to start of loop
            ], undefined, storeBreakDepth(s))
        ])
    );

    storageFinishCallback();
    return instr;
}

function _whileLoop(ctx: WFnGenerator, s: c.CWhileLoop): WInstruction[] {
    if (s.body === undefined) throw new GenError("Invalid while loop body", ctx, s.node);

    return [Instructions.loop(null, [
        ...condition(ctx, s.test),
        Instructions.if(null, [
            ...statementGeneration(ctx, s.body),
            Instructions.br(1) // jump back to start of loop
        ], undefined, storeBreakDepth(s))
    ], storeContinueDepth(s))];
}

function _doLoop(ctx: WFnGenerator, s: c.CDoLoop): WInstruction[] {
    if (s.body === undefined) throw new GenError("Invalid while loop body", ctx, s.node);

    return [Instructions.block(null, [
        Instructions.loop(null, [
            ...statementGeneration(ctx, s.body),
            ...condition(ctx, s.test),
            Instructions.br_if(0)
        ], storeContinueDepth(s))
    ], storeBreakDepth(s))];
}

function _switch(ctx: WFnGenerator, s: c.CSwitch): WInstruction[] {
    const type = valueType(s.expression.type as CArithmetic);
    return ctx.withTemporaryLocal(type, value => {
        const initInstr: WInstruction[] = [
            ...expressionGeneration(ctx, s.expression, false),
            Instructions.local.set(value)
        ];

        let defaultIndex = s.children.findIndex(x => x.default);
        if (defaultIndex === -1) defaultIndex = s.children.length;

        const checks: WInstruction[] = [];
        // check if we can use br_table
        let minValue = 2n ** 65n, maxValue = -minValue, numCases = 0;
        for (const child of s.children) {
            for (const sCase of child.cases) {
                if (sCase.value > maxValue) maxValue = BigInt(sCase.value);
                if (sCase.value < minValue) minValue = BigInt(sCase.value);
                numCases++;
            }
        }
        if (maxValue - minValue <= Math.min(2 ** 16, numCases * 8) && getFlags().generation_switch_br_table) { // basic heuristic
            // use br_table
            checks.push(Instructions.local.get(value));
            if (minValue < 0 || minValue > 16) { // adjust to start at zero
                const typeInstrs = type === i32Type ? Instructions.i32 : Instructions.i64;
                checks.push(typeInstrs.const(minValue), typeInstrs.sub());
            } else {
                minValue = 0n;
            }
            if (type === i64Type) checks.push(Instructions.i32.wrap_i64());

            // build actual jump table
            const table: number[] = Array(Number(maxValue - minValue) + 1).fill(defaultIndex);
            for (const [depth, child] of s.children.entries()) {
                for (const sCase of child.cases) {
                    table[Number(sCase.value) - Number(minValue)] = depth;
                }
            }

            checks.push(Instructions.br_table(defaultIndex, table));

        } else {
            // use manual jump table
            for (const [depth, child] of s.children.entries()) {
                for (const sCase of child.cases) {
                    if (sCase.type instanceof CPointer) throw new GenError("Invalid switch case", ctx, s.node);
                    const constant = new CConstant(s.node, sCase.type, sCase.value);
                    checks.push(Instructions.local.get(value), ...subExpr(ctx, constant, s.expression.type), gInstr(type, "eq"));
                    checks.push(Instructions.br_if(depth));
                }
            }
            // add default
            checks.push(Instructions.br(defaultIndex));
        }

        // case bodies
        let block = Instructions.block(null, checks);
        for (let i = 0; i < s.children.length; i++) {
            block = Instructions.block(null, [
                block,
                ...ctx.statement(s.children[i].body)
            ], i === s.children.length - 1 ? storeBreakDepth(s) : undefined); // final case body is also break target
        }

        return [...initInstr, block];
    });
}

function _goto(ctx: WFnGenerator, s: c.CGoto): WInstruction[] {
    return [Instructions.br({
        getIndex(depth: number): labelidx {
            const statement = s.target as any as Record<typeof breakDepthSymbol, number | undefined>;
            const targetDepth = statement[breakDepthSymbol];
            if (targetDepth === undefined) throw new GenError("Failed to find target depth", ctx, s.node);

            return BigInt(depth - targetDepth) as labelidx;
        }
    })];
}

function _continue(ctx: WFnGenerator, s: c.CContinue): WInstruction[] {
    return [Instructions.br({
        getIndex(depth: number): labelidx {
            const statement = s.loop as any as Record<typeof continueDepthSymbol, number | undefined>;
            const targetDepth = statement[continueDepthSymbol];
            if (targetDepth === undefined) throw new GenError("Failed to find continue depth", ctx, s.node);

            return BigInt(depth - targetDepth) as labelidx;
        }
    })];
}

function _break(ctx: WFnGenerator, s: c.CBreak): WInstruction[] {
    return [Instructions.br({
        getIndex(depth: number): labelidx {
            const statement = s.target as any as Record<typeof breakDepthSymbol, number | undefined>;
            const targetDepth = statement[breakDepthSymbol];
            if (targetDepth === undefined) throw new GenError("Failed to find break depth", ctx, s.node);

            return BigInt(depth - targetDepth) as labelidx;
        }
    })];
}

function _return(ctx: WFnGenerator, s: c.CReturn): WInstruction[] {
    if (s.value === undefined) {
        return [Instructions.return()];
    } else if (largeReturn(s.func.type.returnType)) {
        // copy return value to large return parameter (the last parameter)
        return [...memcpy(
            subExpr(ctx, s.value, s.func.type.returnType),
            [Instructions.local.get(s.func.type.parameterTypes.length)],
            s.value.type.bytes),
        Instructions.return()];
    } else {
        return [...subExpr(ctx, s.value, s.func.type.returnType), Instructions.return()];
    }
}

export function statementGeneration(ctx: WFnGenerator, s: c.CStatement): WInstruction[] {
    if (s instanceof c.CCompoundStatement) return _compoundStatement(ctx, s);
    else if (s instanceof c.CExpressionStatement) return _expressionStatement(ctx, s);
    else if (s instanceof c.CNop) return _nop(ctx, s);
    else if (s instanceof c.CIf) return _if(ctx, s);
    else if (s instanceof c.CForLoop) return _forLoop(ctx, s);
    else if (s instanceof c.CWhileLoop) return _whileLoop(ctx, s);
    else if (s instanceof c.CDoLoop) return _doLoop(ctx, s);
    else if (s instanceof c.CSwitch) return _switch(ctx, s);
    else if (s instanceof c.CGoto) return _goto(ctx, s);
    else if (s instanceof c.CContinue) return _continue(ctx, s);
    else if (s instanceof c.CBreak) return _break(ctx, s);
    else return _return(ctx, s);
}

// break and continue depth helpers
const breakDepthSymbol = Symbol("break depth");
const continueDepthSymbol = Symbol("continue depth");

function storeBreakDepth<T extends c.CForLoop | c.CWhileLoop | c.CDoLoop | c.CSwitch | c.CLabelledStatement>(s: T): (c: {depth: number}) => void {
    const statement = s as Record<typeof breakDepthSymbol, any>;
    return ({depth}) => {
        // passed the instruction's context, so the depth of the structured instruction is depth + 1
        statement[breakDepthSymbol] = depth + 1;
    };
}

function storeContinueDepth<T extends c.CForLoop | c.CWhileLoop | c.CDoLoop>(s: T): (c: {depth: number}) => void {
    const statement = s as Record<typeof continueDepthSymbol, any>;
    return ({depth}) => {
        statement[continueDepthSymbol] = depth + 1;
    };
}
