import {CExpression, CConstant, CAddSub} from "../tree/expressions";
import {WFunctionBuilder, i32Type, Instructions, i64Type, f32Type, f64Type} from "../wasm";
import {WExpression} from "../wasm/instructions";
import {WGenerator} from "./generator";
import {getType} from "./type_conversion";

export function expressionGeneration(m: WGenerator, e: CExpression, b: WFunctionBuilder): WExpression {
    if (e instanceof CConstant) {
        const type = getType(e.type);
        if (type === i32Type) return [Instructions.i32.const(e.value)];
        if (type === i64Type) return [Instructions.i64.const(e.value as bigint)];
        if (type === f32Type) return [Instructions.f32.const(e.value as number)];
        if (type === f64Type) return [Instructions.f64.const(e.value as number)];
        // TODO CConstant enum values
    } else if (e instanceof CAddSub) {
        // TODO CAddSub pointers
    }

    throw new Error("TODO");
}
