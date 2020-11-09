import {CExpression, CConstant, CAddSub, CCast, CUnaryPlusMinus} from "../tree/expressions";
import {WFunctionBuilder, i32Type, Instructions, i64Type, f32Type, f64Type} from "../wasm";
import {WExpression} from "../wasm/instructions";
import {WGenerator} from "./generator";
import {getType, conversion} from "./type_conversion";

export function expressionGeneration(m: WGenerator, e: CExpression, b: WFunctionBuilder): WExpression {
    if (e instanceof CConstant) {
        const type = getType(e.type);
        if (type === i32Type) return [Instructions.i32.const(e.value)];
        if (type === i64Type) return [Instructions.i64.const(e.value as bigint)];
        if (type === f32Type) return [Instructions.f32.const(e.value as number)];
        if (type === f64Type) return [Instructions.f64.const(e.value as number)];
        // TODO CConstant enum values
    } else if (e instanceof CCast) {
        return [...expressionGeneration(m, e.body, b), ...conversion(e.body.type, e.type)];
    } else if (e instanceof CUnaryPlusMinus) {
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

    throw new Error("TODO");
}
