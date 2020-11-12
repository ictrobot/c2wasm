import {CFuncDefinition, CFuncDeclaration} from "../tree/declarations";
import {CExpression} from "../tree/expressions";
import * as c from "../tree/expressions";
import {CType, CArithmetic, CPointer, CArray} from "../tree/types";
import {i32Type, Instructions, i64Type, f32Type, f64Type} from "../wasm";
import {WExpression} from "../wasm/instructions";
import {WFnGenerator} from "./generator";
import {storageGet, storageSet, storageUpdate, storageGetThenUpdate, getAddress} from "./storage";
import {ImplementationType, implType, conversion, valueType, realType} from "./type_conversion";

function constant(ctx: WFnGenerator, e: c.CConstant, discard: boolean): WExpression {
    if (discard) return []; // no possible side effects

    if (e.type instanceof CArithmetic) {
        return [gInstr(valueType(e.type), "const", e.value)];
    }
    // TODO CConstant enum values
    throw new Error("TODO: enum constants");
}

function identifier(ctx: WFnGenerator, e: c.CIdentifier, discard: boolean): WExpression {
    if (discard) return []; // no possible side effects

    return storageGet(ctx, e.type, e);
}

function arrayPointer(ctx: WFnGenerator, e: c.CArrayPointer, discard: boolean): WExpression {
    if (discard) return []; // no possible side effects

    return getAddress(ctx, e.arrayIdentifier);
}

function stringLiteral(ctx: WFnGenerator, e: c.CStringLiteral, discard: boolean): WExpression {
    if (discard) return []; // no possible side effects

    // TODO store string literals as static variables
    throw new Error("TODO: stringLiteral");
}

function functionCall(ctx: WFnGenerator, e: c.CFunctionCall, discard: boolean): WExpression {
    const instr = e.args.flatMap((arg, i) =>
        subExpr(ctx, arg, e.fnType.parameterTypes[i]));
    if (!(e.body instanceof c.CIdentifier) || !(e.body.value instanceof CFuncDefinition || e.body.value instanceof CFuncDeclaration)) {
        throw new Error("Invalid fn call identifier");
    }

    const fn = e.body.value as CFuncDeclaration | CFuncDefinition;
    if (ctx.shadowStackUsage > 0) {
        // increment shadow stack pointer for callee
        instr.push(Instructions.global.get(ctx.gen.shadowStackPtr),
            Instructions.i32.const(ctx.shadowStackUsage),
            Instructions.i32.add(),
            Instructions.global.set(ctx.gen.shadowStackPtr));
    }

    instr.push(Instructions.call(ctx.gen.functionIndex(fn)));

    if (discard && e.fnType.returnType.bytes > 0) {
        instr.push(Instructions.drop());
    }
    if (ctx.shadowStackUsage > 0) {
        // restore shadow stack pointer
        instr.push(Instructions.global.get(ctx.gen.shadowStackPtr),
            Instructions.i32.const(ctx.shadowStackUsage),
            Instructions.i32.sub(),
            Instructions.global.set(ctx.gen.shadowStackPtr));
    }
    return instr;
}

function memberAccess(ctx: WFnGenerator, e: c.CMemberAccess, discard: boolean): WExpression {
    throw new Error("TODO: memberAccess");
}

function incrDecr(ctx: WFnGenerator, e: c.CIncrDecr, discard: boolean): WExpression {
    let amount = 1;
    if (e.type instanceof CPointer) amount = Math.ceil(e.body.type.bytes / 4) * 4;

    const type = realType(e.type);
    if (e.pos === "post" && !discard) {
        return storageGetThenUpdate(ctx, e.body.type, e.body, [
            gConst(type, amount),
            gInstr(type, e.op === "++" ? "add" : "sub"),
        ]);
    } else {
        // can convert post and discard => pre with discard

        return storageUpdate(ctx, e.body.type, e.body, [
            gConst(type, amount),
            gInstr(type, e.op === "++" ? "add" : "sub"),
        ], !discard && e.pos === "pre");
    }
}

function addressOf(ctx: WFnGenerator, e: c.CAddressOf, discard: boolean): WExpression {
    if (discard) return expressionGeneration(ctx, e.body, true); // get any side effects

    return getAddress(ctx, e.body);
}

function dereference(ctx: WFnGenerator, e: c.CDereference, discard: boolean): WExpression {
    if (discard) return expressionGeneration(ctx, e.body, true); // get any side effects

    return storageGet(ctx, e.type, e);
}

function unaryPlusMinus(ctx: WFnGenerator, e: c.CUnaryPlusMinus, discard: boolean): WExpression {
    if (discard) return expressionGeneration(ctx, e.body, true); // get any side effects

    const instr = expressionGeneration(ctx, e.body, false);
    if (e.op === "-") {
        const type = implType(e.body.type);
        instr.push(gConst(type, -1), gInstr(type, "mul"));
    }
    return instr;
}

function bitwiseNot(ctx: WFnGenerator, e: c.CBitwiseNot, discard: boolean): WExpression {
    if (discard) return expressionGeneration(ctx, e.body, true); // get any side effects

    const wType = valueType(e.type);
    return [...subExpr(ctx, e.body, e.type), iInstr(wType, "const", -1n), iInstr(wType, "xor")];
}

function logicalNot(ctx: WFnGenerator, e: c.CLogicalNot, discard: boolean): WExpression {
    if (discard) return expressionGeneration(ctx, e.body, true); // get any side effects

    const instr = expressionGeneration(ctx, e.body, false);
    const wType = valueType(e.type);

    if (isIValueType(wType)) {
        return [...instr, iInstr(wType, "eqz")];
    } else {
        return [...instr, fInstr(wType, "const", 0), fInstr(wType, "eq")];
    }
}

function sizeof(ctx: WFnGenerator, e: c.CSizeof, discard: boolean): WExpression {
    if (discard) return []; // no possible side effects

    return [Instructions.i32.const(e.body.bytes)];
}

function cast(ctx: WFnGenerator, e: c.CCast, discard: boolean): WExpression {
    if (discard) return expressionGeneration(ctx, e.body, true); // get any side effects

    return [...expressionGeneration(ctx, e.body, false), ...conversion(e.body.type, e.type)];
}

function mulDiv(ctx: WFnGenerator, e: c.CMulDiv, discard: boolean): WExpression {
    if (discard) return [...expressionGeneration(ctx, e.lhs, true), ...expressionGeneration(ctx, e.rhs, true)];

    const instr = [...subExpr(ctx, e.lhs, e.type), ...subExpr(ctx, e.rhs, e.type)];
    const wType = valueType(e.type);
    if (isIValueType(wType)){
        if (e.op === "*") instr.push(iInstr(wType, "mul"));
        else instr.push(e.type.type === "signed" ? iInstr(wType, "div_s") : iInstr(wType, "div_u"));
    } else {
        instr.push(e.op === "*" ? fInstr(wType, "mul") : fInstr(wType, "div"));
    }

    return instr;
}

function mod(ctx: WFnGenerator, e: c.CMod, discard: boolean): WExpression {
    if (discard) return [...expressionGeneration(ctx, e.lhs, true), ...expressionGeneration(ctx, e.rhs, true)];

    const wType = valueType(e.type);
    if (e.type.type === "signed") {
        return [...subExpr(ctx, e.lhs, e.type), ...subExpr(ctx, e.rhs, e.type), iInstr(wType, "rem_s")];
    } else {
        return [...subExpr(ctx, e.lhs, e.type), ...subExpr(ctx, e.rhs, e.type), iInstr(wType, "rem_u")];
    }
}

function addSub(ctx: WFnGenerator, e: c.CAddSub, discard: boolean): WExpression {
    if (discard) return [...expressionGeneration(ctx, e.lhs, true), ...expressionGeneration(ctx, e.rhs, true)];

    if (e.type instanceof CArithmetic) {
        const lhs = subExpr(ctx, e.lhs, e.type);
        const rhs = subExpr(ctx, e.rhs, e.type);
        const wType = valueType(e.type);
        return [...lhs, ...rhs, e.op === "+" ? gInstr(wType, "add") : gInstr(wType, "sub")];
    } else {
        // eslint-disable-next-line no-inner-declarations
        function toExpr(side: CExpression) {
            if (side.type instanceof CPointer) {
                return ctx.expression(side, false);
            } else { // if side.type === integer
                const instr = subExpr(ctx, side, CArithmetic.U32);
                const size = (e.type as CPointer).type.bytes;
                if (size > 1) instr.push(Instructions.i32.const(size), Instructions.i32.mul());
                return instr;
            }
        }

        return [...toExpr(e.lhs), ...toExpr(e.rhs), e.op === "+" ? Instructions.i32.add() : Instructions.i32.sub()];
    }
}

function shift(ctx: WFnGenerator, e: c.CShift, discard: boolean): WExpression {
    if (discard) return [...expressionGeneration(ctx, e.lhs, true), ...expressionGeneration(ctx, e.rhs, true)];

    const wType = valueType(e.type);
    if (e.dir === "left") {
        return [...subExpr(ctx, e.lhs, e.type), ...subExpr(ctx, e.rhs, e.type), iInstr(wType, "shl")];
    } else if (e.type.type === "signed") {
        return [...subExpr(ctx, e.lhs, e.type), ...subExpr(ctx, e.rhs, e.type), iInstr(wType, "shr_s")];
    } else {
        return [...subExpr(ctx, e.lhs, e.type), ...subExpr(ctx, e.rhs, e.type), iInstr(wType, "shr_u")];
    }
}

function relational(ctx: WFnGenerator, e: c.CRelational, discard: boolean): WExpression {
    if (discard) return [...expressionGeneration(ctx, e.lhs, true), ...expressionGeneration(ctx, e.rhs, true)];

    const wType = valueType(e.commonType);
    if (!isIValueType(wType)) {
        return [...subExpr(ctx, e.lhs, e.commonType), ...subExpr(ctx, e.rhs, e.commonType),
            e.op === "LT" ? fInstr(wType, "lt") :
                e.op === "GT" ? fInstr(wType, "gt") :
                    e.op === "LEq" ? fInstr(wType, "le") : fInstr(wType, "ge")];
    } else if (e.commonType.type === "signed") {
        return [...subExpr(ctx, e.lhs, e.commonType), ...subExpr(ctx, e.rhs, e.commonType),
            e.op === "LT" ? iInstr(wType, "lt_s") :
                e.op === "GT" ? iInstr(wType, "gt_s") :
                    e.op === "LEq" ? iInstr(wType, "le_s") : iInstr(wType, "ge_s")];
    } else {
        return [...subExpr(ctx, e.lhs, e.commonType), ...subExpr(ctx, e.rhs, e.commonType),
            e.op === "LT" ? iInstr(wType, "lt_u") :
                e.op === "GT" ? iInstr(wType, "gt_u") :
                    e.op === "LEq" ? iInstr(wType, "le_u") : iInstr(wType, "ge_u")];
    }
}

function equality(ctx: WFnGenerator, e: c.CEquality, discard: boolean): WExpression {
    if (discard) return [...expressionGeneration(ctx, e.lhs, true), ...expressionGeneration(ctx, e.rhs, true)];

    return [
        ...subExpr(ctx, e.lhs, e.commonType),
        ...subExpr(ctx, e.rhs, e.commonType),
        gInstr(valueType(e.commonType), e.op === "==" ? "eq" : "ne")];
}

function bitwiseAndOr(ctx: WFnGenerator, e: c.CBitwiseAndOr, discard: boolean): WExpression {
    if (discard) return [...expressionGeneration(ctx, e.lhs, true), ...expressionGeneration(ctx, e.rhs, true)];

    return [...subExpr(ctx, e.lhs, e.type), ...subExpr(ctx, e.rhs, e.type), iInstr(valueType(e.type), e.op)];
}

function logicalAndOr(ctx: WFnGenerator, e: c.CLogicalAndOr, discard: boolean): WExpression {
    if (discard) return [...expressionGeneration(ctx, e.lhs, true), ...expressionGeneration(ctx, e.rhs, true)];

    if (e.op === "and") {
        return [...condition(ctx, e.lhs), Instructions.if(i32Type, condition(ctx, e.rhs, false), [
            Instructions.i32.const(0n)
        ])];
    } else { // op === "or"
        return [...condition(ctx, e.lhs), Instructions.if(i32Type, [
            Instructions.i32.const(1n)
        ], condition(ctx, e.rhs, false))];
    }
}

function conditional(ctx: WFnGenerator, e: c.CConditional, discard: boolean): WExpression {
    const test = condition(ctx, e.test);
    if (discard) {
        const trueSideEffects = expressionGeneration(ctx, e.trueValue, true);
        const falseSideEffects = expressionGeneration(ctx, e.falseValue,true);
        if (trueSideEffects.length === 0 && falseSideEffects.length === 0) return [];

        return [...test, Instructions.if(null, trueSideEffects, falseSideEffects)];
    } else {
        return [...test, Instructions.if(realType(e.type),
            subExpr(ctx, e.trueValue, e.type),
            subExpr(ctx, e.falseValue, e.type))];
    }
}

function assignment(ctx: WFnGenerator, e: c.CAssignment, discard: boolean): WExpression {
    if (e.assignmentType !== undefined || e.rhs instanceof c.CInitializer) throw new Error("TODO");
    // += etc could be implemented as a storageUpdate

    return storageSet(ctx, e.lhs.type, e.lhs, e.rhs, !discard);
}

function comma(ctx: WFnGenerator, e: c.CComma, discard: boolean): WExpression {
    return [...expressionGeneration(ctx, e.lhs, true), ...expressionGeneration(ctx, e.rhs, discard)];
}

export function expressionGeneration(ctx: WFnGenerator, e: c.CExpression, discard: boolean): WExpression {
    if (e instanceof c.CConstant) return constant(ctx, e, discard);
    else if (e instanceof c.CIdentifier) return identifier(ctx, e, discard);
    else if (e instanceof c.CArrayPointer) return arrayPointer(ctx, e, discard);
    else if (e instanceof c.CStringLiteral) return stringLiteral(ctx, e, discard);
    else if (e instanceof c.CFunctionCall) return functionCall(ctx, e, discard);
    else if (e instanceof c.CMemberAccess) return memberAccess(ctx, e, discard);
    else if (e instanceof c.CIncrDecr) return incrDecr(ctx, e, discard);
    else if (e instanceof c.CAddressOf) return addressOf(ctx, e, discard);
    else if (e instanceof c.CDereference) return dereference(ctx, e, discard);
    else if (e instanceof c.CUnaryPlusMinus) return unaryPlusMinus(ctx, e, discard);
    else if (e instanceof c.CBitwiseNot) return bitwiseNot(ctx, e, discard);
    else if (e instanceof c.CLogicalNot) return logicalNot(ctx, e, discard);
    else if (e instanceof c.CSizeof) return sizeof(ctx, e, discard);
    else if (e instanceof c.CCast) return cast(ctx, e, discard);
    else if (e instanceof c.CMulDiv) return mulDiv(ctx, e, discard);
    else if (e instanceof c.CMod) return mod(ctx, e, discard);
    else if (e instanceof c.CAddSub) return addSub(ctx, e, discard);
    else if (e instanceof c.CShift) return shift(ctx, e, discard);
    else if (e instanceof c.CRelational) return relational(ctx, e, discard);
    else if (e instanceof c.CEquality) return equality(ctx, e, discard);
    else if (e instanceof c.CBitwiseAndOr) return bitwiseAndOr(ctx, e, discard);
    else if (e instanceof c.CLogicalAndOr) return logicalAndOr(ctx, e, discard);
    else if (e instanceof c.CConditional) return conditional(ctx, e, discard);
    else if (e instanceof c.CAssignment) return assignment(ctx, e, discard);
    else return comma(ctx, e, discard);
}

// helpers
/** expressionGeneration + casting */
export function subExpr(ctx: WFnGenerator, e: c.CExpression, desiredType: CType, discard: boolean = false): WExpression {
    return [...expressionGeneration(ctx, e, discard), ...conversion(e.type, desiredType)];
}

export function condition(ctx: WFnGenerator, e: c.CExpression, anyNonZeroI32 = true): WExpression {
    const wType = implType(e.type);
    if (wType === i32Type || wType instanceof CPointer) {
        if (anyNonZeroI32) {
            return expressionGeneration(ctx, e, false);
        } else {
            return [...expressionGeneration(ctx, e, false), Instructions.i32.const(0n), Instructions.i32.ne()];
        }
    } else if (typeof wType !== "number") {
        throw new Error("Invalid condition");
    }
    return [...expressionGeneration(ctx, e, false), gConst(wType, 0), gInstr(wType, "ne")];
}

function isIValueType(w: ImplementationType) {
    return w === i32Type || w === i64Type;
}

/** f32 or f64 instruction */
function fInstr(t: ImplementationType, op: (keyof typeof Instructions.f32 & keyof typeof Instructions.f64), ...args: any[]) {
    if (typeof t !== "number") throw new Error("Instructions can only operate on value types");

    if (t === f32Type) {
        // @ts-ignore
        return Instructions.f32[op](...args);
    } else if (t === f64Type) {
        // @ts-ignore
        return Instructions.f64[op](...args);
    }
    throw new Error("Invalid value type for floating point instruction");
}

/** i32 or i64 instruction */
function iInstr(t: ImplementationType, op: (keyof typeof Instructions.i32 & keyof typeof Instructions.i64), ...args: any[]) {
    if (typeof t !== "number") throw new Error("Instructions can only operate on value types");

    if (t === i32Type) {
        // @ts-ignore
        return Instructions.i32[op](...args);
    } else if (t === i64Type) {
        // @ts-ignore
        return Instructions.i64[op](...args);
    }
    throw new Error("Invalid value type for integer instruction");
}

/** generic instruction - i32, i64, f32 or f64 */
function gInstr(t: ImplementationType, op: (keyof typeof Instructions.i32 & keyof typeof Instructions.i64 & keyof typeof Instructions.f32 & keyof typeof Instructions.f64), ...args: any[]) {
    if (typeof t !== "number") throw new Error("Instructions can only operate on value types");

    if (t === i32Type) {
        // @ts-ignore
        return Instructions.i32[op](...args);
    } else if (t === i64Type) {
        // @ts-ignore
        return Instructions.i64[op](...args);
    } else if (t === f32Type) {
        // @ts-ignore
        return Instructions.f32[op](...args);
    } else if (t === f64Type) {
        // @ts-ignore
        return Instructions.f64[op](...args);
    }
    throw new Error("Invalid value type?");
}

/** generic constant */
function gConst(t: ImplementationType, n: number) {
    if (typeof t !== "number") throw new Error("Constants can only take value types");
    if (t !== (t | 0)) throw new Error("Invalid generic constant - not integer");

    if (t === i32Type) {
        return Instructions.i32.const(BigInt(n));
    } else if (t === i64Type) {
        return Instructions.i64.const(BigInt(n));
    } else if (t === f32Type) {
        return Instructions.f32.const(n);
    } else if (t === f64Type) {
        return Instructions.f64.const(n);
    }
    throw new Error("Invalid value type?");
}
