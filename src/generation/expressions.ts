import {CFuncDefinition, CFuncDeclaration} from "../tree/declarations";
import * as c from "../tree/expressions";
import {CType, CArithmetic, CPointer} from "../tree/types";
import {WFunctionBuilder, i32Type, Instructions, i64Type, f32Type, f64Type} from "../wasm";
import {WExpression} from "../wasm/instructions";
import {WGenerator} from "./generator";
import {storageGet, storageLocationFromExpression, storageSet} from "./storage";
import {ImplementationType, implType, conversion, valueType, realType} from "./type_conversion";

function constant(m: WGenerator, e: c.CConstant, discard: boolean): WExpression {
    if (discard) return []; // no possible side effects

    if (e.type instanceof CArithmetic) {
        return [gInstr(valueType(e.type), "const", e.value)];
    }
    // TODO CConstant enum values
    throw new Error("TODO: enum constants");
}

function identifier(m: WGenerator, e: c.CIdentifier, discard: boolean): WExpression {
    if (discard) return []; // no possible side effects

    const [instr, loc] = storageLocationFromExpression(m, e);
    return [...instr, ...storageGet(m, loc)];
}

function stringLiteral(m: WGenerator, e: c.CStringLiteral, discard: boolean): WExpression {
    if (discard) return []; // no possible side effects

    throw new Error("TODO: stringLiteral");
}

function functionCall(m: WGenerator, e: c.CFunctionCall, discard: boolean): WExpression {
    const instr = e.args.flatMap((arg, i) =>
        subExpr(m, arg, e.fnType.parameterTypes[i]));
    if (!(e.body instanceof c.CIdentifier) || !(e.body.value instanceof CFuncDefinition || e.body.value instanceof CFuncDeclaration)) {
        throw new Error("Invalid fn call identifier");
    }

    const fn = e.body.value as CFuncDeclaration | CFuncDefinition;
    instr.push(Instructions.call(m.functionIndex(fn)));

    if (discard && e.fnType.returnType.bytes > 0) instr.push(Instructions.drop());
    return instr;
}

function memberAccess(m: WGenerator, e: c.CMemberAccess, discard: boolean): WExpression {
    throw new Error("TODO: memberAccess");
}

function incrDecr(m: WGenerator, e: c.CIncrDecr, discard: boolean): WExpression {
    throw new Error("TODO: incrDecr");
}

function addressOf(m: WGenerator, e: c.CAddressOf, discard: boolean): WExpression {
    throw new Error("TODO: addressOf");
}

function dereference(m: WGenerator, e: c.CDereference, discard: boolean): WExpression {
    throw new Error("TODO: dereference");
}

function unaryPlusMinus(m: WGenerator, e: c.CUnaryPlusMinus, discard: boolean): WExpression {
    if (discard) return expressionGeneration(m, e.body, true); // get any side effects

    const instr = expressionGeneration(m, e.body, false);
    if (e.op === "-") {
        const type = implType(e.body.type);
        instr.push(gConst(type, -1), gInstr(type, "mul"));
    }
    return instr;
}

function bitwiseNot(m: WGenerator, e: c.CBitwiseNot, discard: boolean): WExpression {
    if (discard) return expressionGeneration(m, e.body, true); // get any side effects

    const wType = valueType(e.type);
    return [...subExpr(m, e.body, e.type), iInstr(wType, "const", -1n), iInstr(wType, "xor")];
}

function logicalNot(m: WGenerator, e: c.CLogicalNot, discard: boolean): WExpression {
    if (discard) return expressionGeneration(m, e.body, true); // get any side effects

    const instr = expressionGeneration(m, e.body, false);
    const wType = valueType(e.type);

    if (isIValueType(wType)) {
        return [...instr, iInstr(wType, "eqz")];
    } else {
        return [...instr, fInstr(wType, "const", 0), fInstr(wType, "eq")];
    }
}

function sizeof(m: WGenerator, e: c.CSizeof, discard: boolean): WExpression {
    if (discard) return []; // no possible side effects

    return [Instructions.i32.const(e.body.bytes)];
}

function cast(m: WGenerator, e: c.CCast, discard: boolean): WExpression {
    if (discard) return expressionGeneration(m, e.body, true); // get any side effects

    return [...expressionGeneration(m, e.body, false), ...conversion(e.body.type, e.type)];
}

function mulDiv(m: WGenerator, e: c.CMulDiv, discard: boolean): WExpression {
    if (discard) return [...expressionGeneration(m, e.lhs, true), ...expressionGeneration(m, e.rhs, true)];

    const instr = [...subExpr(m, e.lhs, e.type), ...subExpr(m, e.rhs, e.type)];
    const wType = valueType(e.type);
    if (isIValueType(wType)){
        if (e.op === "*") instr.push(iInstr(wType, "mul"));
        else instr.push(e.type.type === "signed" ? iInstr(wType, "div_s") : iInstr(wType, "div_u"));
    } else {
        instr.push(e.op === "*" ? fInstr(wType, "mul") : fInstr(wType, "div"));
    }

    return instr;
}

function mod(m: WGenerator, e: c.CMod, discard: boolean): WExpression {
    if (discard) return [...expressionGeneration(m, e.lhs, true), ...expressionGeneration(m, e.rhs, true)];

    const wType = valueType(e.type);
    if (e.type.type === "signed") {
        return [...subExpr(m, e.lhs, e.type), ...subExpr(m, e.rhs, e.type), iInstr(wType, "rem_s")];
    } else {
        return [...subExpr(m, e.lhs, e.type), ...subExpr(m, e.rhs, e.type), iInstr(wType, "rem_u")];
    }
}

function addSub(m: WGenerator, e: c.CAddSub, discard: boolean): WExpression {
    if (discard) return [...expressionGeneration(m, e.lhs, true), ...expressionGeneration(m, e.rhs, true)];

    if (e.type instanceof CArithmetic) {
        const lhs = subExpr(m, e.lhs, e.type);
        const rhs = subExpr(m, e.rhs, e.type);
        const wType = valueType(e.type);
        return [...lhs, ...rhs, e.op === "+" ? gInstr(wType, "add") : gInstr(wType, "sub")];
    }
    // TODO pointer addsub
    throw new Error("TODO: addSub");
}

function shift(m: WGenerator, e: c.CShift, discard: boolean): WExpression {
    if (discard) return [...expressionGeneration(m, e.lhs, true), ...expressionGeneration(m, e.rhs, true)];

    const wType = valueType(e.type);
    if (e.dir === "left") {
        return [...subExpr(m, e.lhs, e.type), ...subExpr(m, e.rhs, e.type), iInstr(wType, "shl")];
    } else if (e.type.type === "signed") {
        return [...subExpr(m, e.lhs, e.type), ...subExpr(m, e.rhs, e.type), iInstr(wType, "shr_s")];
    } else {
        return [...subExpr(m, e.lhs, e.type), ...subExpr(m, e.rhs, e.type), iInstr(wType, "shr_u")];
    }
}

function relational(m: WGenerator, e: c.CRelational, discard: boolean): WExpression {
    if (discard) return [...expressionGeneration(m, e.lhs, true), ...expressionGeneration(m, e.rhs, true)];

    const wType = valueType(e.commonType);
    if (!isIValueType(wType)) {
        return [...subExpr(m, e.lhs, e.commonType), ...subExpr(m, e.rhs, e.commonType),
            e.op === "LT" ? fInstr(wType, "lt") :
                e.op === "GT" ? fInstr(wType, "gt") :
                    e.op === "LEq" ? fInstr(wType, "le") : fInstr(wType, "ge")];
    } else if (e.commonType.type === "signed") {
        return [...subExpr(m, e.lhs, e.commonType), ...subExpr(m, e.rhs, e.commonType),
            e.op === "LT" ? iInstr(wType, "lt_s") :
                e.op === "GT" ? iInstr(wType, "gt_s") :
                    e.op === "LEq" ? iInstr(wType, "le_s") : iInstr(wType, "ge_s")];
    } else {
        return [...subExpr(m, e.lhs, e.commonType), ...subExpr(m, e.rhs, e.commonType),
            e.op === "LT" ? iInstr(wType, "lt_u") :
                e.op === "GT" ? iInstr(wType, "gt_u") :
                    e.op === "LEq" ? iInstr(wType, "le_u") : iInstr(wType, "ge_u")];
    }
}

function equality(m: WGenerator, e: c.CEquality, discard: boolean): WExpression {
    if (discard) return [...expressionGeneration(m, e.lhs, true), ...expressionGeneration(m, e.rhs, true)];

    return [
        ...subExpr(m, e.lhs, e.commonType),
        ...subExpr(m, e.rhs, e.commonType),
        gInstr(valueType(e.commonType), e.op === "==" ? "eq" : "ne")];
}

function bitwiseAndOr(m: WGenerator, e: c.CBitwiseAndOr, discard: boolean): WExpression {
    if (discard) return [...expressionGeneration(m, e.lhs, true), ...expressionGeneration(m, e.rhs, true)];

    return [...subExpr(m, e.lhs, e.type), ...subExpr(m, e.rhs, e.type), iInstr(valueType(e.type), e.op)];
}

function logicalAndOr(m: WGenerator, e: c.CLogicalAndOr, discard: boolean): WExpression {
    if (discard) return [...expressionGeneration(m, e.lhs, true), ...expressionGeneration(m, e.rhs, true)];

    if (e.op === "and") {
        return [...condition(m, e.lhs), Instructions.if(i32Type, condition(m, e.rhs, false), [
            Instructions.i32.const(0n)
        ])];
    } else { // op === "or"
        return [...condition(m, e.lhs), Instructions.if(i32Type, [
            Instructions.i32.const(1n)
        ], condition(m, e.rhs, false))];
    }
}

function conditional(m: WGenerator, e: c.CConditional, discard: boolean): WExpression {
    const test = condition(m, e.test);
    if (discard) {
        const trueSideEffects = expressionGeneration(m, e.trueValue, true);
        const falseSideEffects = expressionGeneration(m, e.falseValue,true);
        if (trueSideEffects.length === 0 && falseSideEffects.length === 0) return [];

        return [...test, Instructions.if(null, trueSideEffects, falseSideEffects)];
    } else {
        return [...test, Instructions.if(realType(e.type),
            subExpr(m, e.trueValue, e.type),
            subExpr(m, e.falseValue, e.type))];
    }
}

function assignment(m: WGenerator, e: c.CAssignment, discard: boolean): WExpression {
    if (e.assignmentType !== undefined || e.rhs instanceof c.CInitializer) throw new Error("TODO");

    const [locationInstructions, loc] = storageLocationFromExpression(m, e.lhs);
    return [
        ...locationInstructions,
        ...subExpr(m, e.rhs, e.type),
        ...storageSet(m, loc, !discard)
    ];
}

function comma(m: WGenerator, e: c.CComma, discard: boolean): WExpression {
    return [...expressionGeneration(m, e.lhs, true), ...expressionGeneration(m, e.rhs, discard)];
}

export function expressionGeneration(m: WGenerator, e: c.CExpression, discard: boolean): WExpression {
    if (e instanceof c.CConstant) return constant(m, e, discard);
    else if (e instanceof c.CIdentifier) return identifier(m, e, discard);
    else if (e instanceof c.CStringLiteral) return stringLiteral(m, e, discard);
    else if (e instanceof c.CFunctionCall) return functionCall(m, e, discard);
    else if (e instanceof c.CMemberAccess) return memberAccess(m, e, discard);
    else if (e instanceof c.CIncrDecr) return incrDecr(m, e, discard);
    else if (e instanceof c.CAddressOf) return addressOf(m, e, discard);
    else if (e instanceof c.CDereference) return dereference(m, e, discard);
    else if (e instanceof c.CUnaryPlusMinus) return unaryPlusMinus(m, e, discard);
    else if (e instanceof c.CBitwiseNot) return bitwiseNot(m, e, discard);
    else if (e instanceof c.CLogicalNot) return logicalNot(m, e, discard);
    else if (e instanceof c.CSizeof) return sizeof(m, e, discard);
    else if (e instanceof c.CCast) return cast(m, e, discard);
    else if (e instanceof c.CMulDiv) return mulDiv(m, e, discard);
    else if (e instanceof c.CMod) return mod(m, e, discard);
    else if (e instanceof c.CAddSub) return addSub(m, e, discard);
    else if (e instanceof c.CShift) return shift(m, e, discard);
    else if (e instanceof c.CRelational) return relational(m, e, discard);
    else if (e instanceof c.CEquality) return equality(m, e, discard);
    else if (e instanceof c.CBitwiseAndOr) return bitwiseAndOr(m, e, discard);
    else if (e instanceof c.CLogicalAndOr) return logicalAndOr(m, e, discard);
    else if (e instanceof c.CConditional) return conditional(m, e, discard);
    else if (e instanceof c.CAssignment) return assignment(m, e, discard);
    else return comma(m, e, discard);
}

// helpers
/** expressionGeneration + casting */
export function subExpr(m: WGenerator, e: c.CExpression, desiredType: CType, discard: boolean = false): WExpression {
    return [...expressionGeneration(m, e, discard), ...conversion(e.type, desiredType)];
}

export function condition(m: WGenerator, e: c.CExpression, anyNonZeroI32 = true): WExpression {
    const wType = implType(e.type);
    if (wType === i32Type || wType instanceof CPointer) {
        if (anyNonZeroI32) {
            return expressionGeneration(m, e, false);
        } else {
            return [...expressionGeneration(m, e, false), Instructions.i32.const(0n), Instructions.i32.ne()];
        }
    } else if (typeof wType !== "number") {
        throw new Error("Invalid condition");
    }
    return [...expressionGeneration(m, e, false), gConst(wType, 0), gInstr(wType, "ne")];
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
