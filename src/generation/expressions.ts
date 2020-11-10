import {CFuncDefinition, CFuncDeclaration, CArgument} from "../tree/declarations";
import * as c from "../tree/expressions";
import {CType, CArithmetic} from "../tree/types";
import {WFunctionBuilder, i32Type, Instructions, i64Type, f32Type, f64Type, ValueType} from "../wasm";
import {WExpression} from "../wasm/instructions";
import {WGenerator} from "./generator";
import {getType, conversion, valueType} from "./type_conversion";

function constant(m: WGenerator, e: c.CConstant, b: WFunctionBuilder): WExpression {
    if (e.type instanceof CArithmetic) {
        return [gInstr(valueType(e.type), "const", e.value)];
    }
    // TODO CConstant enum values
    throw new Error("TODO: enum constants");
}

function identifier(m: WGenerator, e: c.CIdentifier, b: WFunctionBuilder): WExpression {
    if (e.value instanceof CArgument) {
        return [Instructions.local.get(b.args[e.value.index])];
    }
    // TODO fix identifiers
    throw new Error("TODO: identifier");
}

function stringLiteral(m: WGenerator, e: c.CStringLiteral, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: stringLiteral");
}

function functionCall(m: WGenerator, e: c.CFunctionCall, b: WFunctionBuilder): WExpression {
    const instr = e.args.flatMap((arg, i) =>
        subExpr(m, arg, b, e.fnType.parameterTypes[i]));
    if (!(e.body instanceof c.CIdentifier) || !(e.body.value instanceof CFuncDefinition || e.body.value instanceof CFuncDeclaration)) {
        throw new Error("Invalid fn call identifier");
    }
    const fn = e.body.value as CFuncDeclaration | CFuncDefinition;
    instr.push(Instructions.call(m.functionIndex(fn)));
    return instr;
}

function memberAccess(m: WGenerator, e: c.CMemberAccess, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: memberAccess");
}

function incrDecr(m: WGenerator, e: c.CIncrDecr, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: incrDecr");
}

function addressOf(m: WGenerator, e: c.CAddressOf, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: addressOf");
}

function dereference(m: WGenerator, e: c.CDereference, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: dereference");
}

function unaryPlusMinus(m: WGenerator, e: c.CUnaryPlusMinus, b: WFunctionBuilder): WExpression {
    const instr = expressionGeneration(m, e.body, b);
    if (e.op === "-") {
        const type = getType(e.body.type);
        instr.push(gConst(type, -1), gInstr(type, "mul"));
    }
    return instr;
}

function bitwiseNot(m: WGenerator, e: c.CBitwiseNot, b: WFunctionBuilder): WExpression {
    const wType = valueType(e.type);
    return [...subExpr(m, e.body, b, e.type), iInstr(wType, "const", -1n), iInstr(wType, "xor")];
}

function logicalNot(m: WGenerator, e: c.CLogicalNot, b: WFunctionBuilder): WExpression {
    const instr = expressionGeneration(m, e.body, b);
    const wType = valueType(e.type);

    if (isIValueType(wType)) {
        return [...instr, iInstr(wType, "eqz")];
    } else {
        return [...instr, fInstr(wType, "const", 0), fInstr(wType, "eq")];
    }
}

function condition(m: WGenerator, e: c.CExpression, b: WFunctionBuilder): WExpression {
    const wType = valueType(e.type);
    if (wType === i32Type) {
        // any non zero i32 is true
        return expressionGeneration(m, e, b);
    }
    return [...expressionGeneration(m, e, b), gConst(wType, 0), gInstr(wType, "ne")];
}

function sizeof(m: WGenerator, e: c.CSizeof, b: WFunctionBuilder): WExpression {
    return [Instructions.i32.const(e.body.bytes)];
}

function cast(m: WGenerator, e: c.CCast, b: WFunctionBuilder): WExpression {
    return [...expressionGeneration(m, e.body, b), ...conversion(e.body.type, e.type)];
}

function mulDiv(m: WGenerator, e: c.CMulDiv, b: WFunctionBuilder): WExpression {
    const instr = [...subExpr(m, e.lhs, b, e.type), ...subExpr(m, e.rhs, b, e.type)];
    const wType = valueType(e.type);
    if (isIValueType(wType)){
        if (e.op === "*") instr.push(iInstr(wType, "mul"));
        else instr.push(e.type.type === "signed" ? iInstr(wType, "div_s") : iInstr(wType, "div_u"));
    } else {
        instr.push(e.op === "*" ? fInstr(wType, "mul") : fInstr(wType, "div"));
    }

    return instr;
}

function mod(m: WGenerator, e: c.CMod, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: mod");
}

function addSub(m: WGenerator, e: c.CAddSub, b: WFunctionBuilder): WExpression {
    if (e.type instanceof CArithmetic) {
        const lhs = subExpr(m, e.lhs, b, e.type);
        const rhs = subExpr(m, e.rhs, b, e.type);
        const wType = valueType(e.type);
        return [...lhs, ...rhs, e.op === "+" ? gInstr(wType, "add") : gInstr(wType, "sub")];
    }
    // TODO pointer addsub
    throw new Error("TODO: addSub");
}

function shift(m: WGenerator, e: c.CShift, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: shift");
}

function relational(m: WGenerator, e: c.CRelational, b: WFunctionBuilder): WExpression {
    const wType = valueType(e.commonType);
    if (!isIValueType(wType)) {
        return [...subExpr(m, e.lhs, b, e.commonType), ...subExpr(m, e.rhs, b, e.commonType),
            e.op === "LT" ? fInstr(wType, "lt") :
                e.op === "GT" ? fInstr(wType, "gt") :
                    e.op === "LEq" ? fInstr(wType, "le") : fInstr(wType, "ge")];
    } else if (e.commonType.type === "signed") {
        return [...subExpr(m, e.lhs, b, e.commonType), ...subExpr(m, e.rhs, b, e.commonType),
            e.op === "LT" ? iInstr(wType, "lt_s") :
                e.op === "GT" ? iInstr(wType, "gt_s") :
                    e.op === "LEq" ? iInstr(wType, "le_s") : iInstr(wType, "ge_s")];
    } else {
        return [...subExpr(m, e.lhs, b, e.commonType), ...subExpr(m, e.rhs, b, e.commonType),
            e.op === "LT" ? iInstr(wType, "lt_u") :
                e.op === "GT" ? iInstr(wType, "gt_u") :
                    e.op === "LEq" ? iInstr(wType, "le_u") : iInstr(wType, "ge_u")];
    }
}

function equality(m: WGenerator, e: c.CEquality, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: equality");
}

function bitwiseAndOr(m: WGenerator, e: c.CBitwiseAndOr, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: bitwiseAndOr");
}

function logicalAndOr(m: WGenerator, e: c.CLogicalAndOr, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: logicalAndOr");
}

function conditional(m: WGenerator, e: c.CConditional, b: WFunctionBuilder): WExpression {
    const test = condition(m, e.test, b);
    const ifStatement = subExpr(m, e.trueValue, b, e.type);
    const elseStatement = e.falseValue !== undefined ? subExpr(m, e.falseValue, b, e.type) : undefined;
    return [...test, Instructions.if(valueType(e.type), ifStatement, elseStatement)];
}

function assignment(m: WGenerator, e: c.CAssignment, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: assignment");
}

function comma(m: WGenerator, e: c.CComma, b: WFunctionBuilder): WExpression {
    return [...expressionGeneration(m, e.lhs, b), Instructions.drop(), ...expressionGeneration(m, e.rhs, b)];
}

export function expressionGeneration(m: WGenerator, e: c.CExpression, b: WFunctionBuilder): WExpression {
    if (e instanceof c.CConstant) return constant(m, e, b);
    else if (e instanceof c.CIdentifier) return identifier(m, e, b);
    else if (e instanceof c.CStringLiteral) return stringLiteral(m, e, b);
    else if (e instanceof c.CFunctionCall) return functionCall(m, e, b);
    else if (e instanceof c.CMemberAccess) return memberAccess(m, e, b);
    else if (e instanceof c.CIncrDecr) return incrDecr(m, e, b);
    else if (e instanceof c.CAddressOf) return addressOf(m, e, b);
    else if (e instanceof c.CDereference) return dereference(m, e, b);
    else if (e instanceof c.CUnaryPlusMinus) return unaryPlusMinus(m, e, b);
    else if (e instanceof c.CBitwiseNot) return bitwiseNot(m, e, b);
    else if (e instanceof c.CLogicalNot) return logicalNot(m, e, b);
    else if (e instanceof c.CSizeof) return sizeof(m, e, b);
    else if (e instanceof c.CCast) return cast(m, e, b);
    else if (e instanceof c.CMulDiv) return mulDiv(m, e, b);
    else if (e instanceof c.CMod) return mod(m, e, b);
    else if (e instanceof c.CAddSub) return addSub(m, e, b);
    else if (e instanceof c.CShift) return shift(m, e, b);
    else if (e instanceof c.CRelational) return relational(m, e, b);
    else if (e instanceof c.CEquality) return equality(m, e, b);
    else if (e instanceof c.CBitwiseAndOr) return bitwiseAndOr(m, e, b);
    else if (e instanceof c.CLogicalAndOr) return logicalAndOr(m, e, b);
    else if (e instanceof c.CConditional) return conditional(m, e, b);
    else if (e instanceof c.CAssignment) return assignment(m, e, b);
    else return comma(m, e, b);
}

// helpers
/** expressionGeneration + casting */
function subExpr(m: WGenerator, e: c.CExpression, b: WFunctionBuilder, desiredType: CType): WExpression {
    return [...expressionGeneration(m, e, b), ...conversion(e.type, desiredType)];
}

function isIValueType(w: ValueType) {
    return w === i32Type || w === i64Type;
}

/** f32 or f64 instruction */
function fInstr(t: ValueType, op: (keyof typeof Instructions.f32 & keyof typeof Instructions.f64), ...args: any[]) {
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
function iInstr(t: ValueType, op: (keyof typeof Instructions.i32 & keyof typeof Instructions.i64), ...args: any[]) {
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
function gInstr(t: ValueType, op: (keyof typeof Instructions.i32 & keyof typeof Instructions.i64 & keyof typeof Instructions.f32 & keyof typeof Instructions.f64), ...args: any[]) {
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
function gConst(t: ValueType, n: number) {
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