import * as c from "../tree/expressions";
import {CType} from "../tree/types";
import {WFunctionBuilder, i32Type, Instructions, i64Type, f32Type, f64Type} from "../wasm";
import {WExpression} from "../wasm/instructions";
import {WGenerator} from "./generator";
import {getType, conversion, valueType} from "./type_conversion";

function constant(m: WGenerator, e: c.CConstant, b: WFunctionBuilder): WExpression {
    const type = getType(e.type);
    if (type === i32Type) return [Instructions.i32.const(e.value)];
    if (type === i64Type) return [Instructions.i64.const(e.value as bigint)];
    if (type === f32Type) return [Instructions.f32.const(e.value as number)];
    if (type === f64Type) return [Instructions.f64.const(e.value as number)];
    // TODO CConstant enum values
    throw new Error("TODO: enum constants");
}

function identifier(m: WGenerator, e: c.CIdentifier, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: identifier");
}

function stringLiteral(m: WGenerator, e: c.CStringLiteral, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: stringLiteral");
}

function functionCall(m: WGenerator, e: c.CFunctionCall, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: functionCall");
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
        if (type === f64Type) instr.push(Instructions.f64.const(-1), Instructions.f64.mul());
        if (type === f32Type) instr.push(Instructions.f32.const(-1), Instructions.f32.mul());
        if (type === i64Type) instr.push(Instructions.i64.const(-1n), Instructions.i64.mul());
        if (type === i32Type) instr.push(Instructions.i32.const(-1n), Instructions.i32.mul());
    }

    return instr;
}

function bitwiseNot(m: WGenerator, e: c.CBitwiseNot, b: WFunctionBuilder): WExpression {
    const instr = subExpr(m, e.body, b, e.type);
    const wType = valueType(e.type);
    if (wType === i32Type) {
        instr.push(Instructions.i32.const(-1), Instructions.i32.xor());
        return instr;
    }
    if (wType === i64Type) {
        instr.push(Instructions.i64.const(-1n), Instructions.i64.xor());
        return instr;
    }
    throw new Error("Bitwise not of unexpected type");
}

function logicalNot(m: WGenerator, e: c.CLogicalNot, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: logicalNot");
}

function sizeof(m: WGenerator, e: c.CSizeof, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: sizeof");
}

function cast(m: WGenerator, e: c.CCast, b: WFunctionBuilder): WExpression {
    return [...expressionGeneration(m, e.body, b), ...conversion(e.body.type, e.type)];
}

function mulDiv(m: WGenerator, e: c.CMulDiv, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: mulDiv");
}

function mod(m: WGenerator, e: c.CMod, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: mod");
}

function addSub(m: WGenerator, e: c.CAddSub, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: addSub");
}

function shift(m: WGenerator, e: c.CShift, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: shift");
}

function relational(m: WGenerator, e: c.CRelational, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: relational");
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
    throw new Error("TODO: conditional");
}

function assignment(m: WGenerator, e: c.CAssignment, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: assignment");
}

function comma(m: WGenerator, e: c.CComma, b: WFunctionBuilder): WExpression {
    throw new Error("TODO: comma");
}

function subExpr(m: WGenerator, e: c.CExpression, b: WFunctionBuilder, desiredType: CType): WExpression {
    return [...expressionGeneration(m, e, b), ...conversion(e.type, desiredType)];
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
