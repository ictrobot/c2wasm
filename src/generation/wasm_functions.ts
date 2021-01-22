import {CFunctionCall, CIdentifier, CConstant} from "../tree/expressions";
import {INTERNAL_FNS} from "../tree/internal_scope";
import {CArithmetic, CStruct, CUnion, CPointer} from "../tree/types";
import {ValueType, i32Type, i64Type, f32Type, f64Type} from "../wasm";
import {byte} from "../wasm/base_types";
import {WInstruction, Instructions} from "../wasm/instructions";
import {GenError} from "./gen_error";
import {WFnGenerator} from "./generator";
import {realType} from "./type_conversion";


function arbitrary(ctx: WFnGenerator, e: CFunctionCall, result: ValueType | null): WInstruction[] {
    if (!(e.args[0] instanceof CConstant)) {
        throw new GenError("__wasm__ first argument should be integer constant specifying the number of parameters", ctx, e.args[0].node);
    }
    const parameters = Number(e.args[0].value);

    const parameterArgs = e.args.slice(1, parameters + 1);
    const parameterInstructions = parameterArgs.flatMap(x => ctx.expression(x, false));

    const instructionArgs = e.args.slice(parameters + 1);
    const instructionBytes = instructionArgs.map(x => {
        if (x instanceof CConstant) return Number(x.changeType(CArithmetic.U8).value);
        throw new GenError("__wasm__ instructions must be constants", ctx, x.node);
    });

    return [
        ...parameterInstructions,
        () => ({
            name: "arbitrary",
            type: "zeroArg",
            immediate: {},

            encoded: instructionBytes as byte[],
            parameters: parameterArgs.map(parm => realType(parm.type)),
            result,
            reads: [],
            writes: ["arbitraryCode"],

            copy() {
                return this;
            }
        })];
}

export function internalFunctions(ctx: WFnGenerator, e: CFunctionCall, discard: boolean): WInstruction[] | undefined {
    if (!(e.body instanceof CIdentifier)) return undefined; // indirect call

    switch (e.body.value) {

    case INTERNAL_FNS.wasm:
        return arbitrary(ctx, e, null);
    case INTERNAL_FNS.wasm_i32:
        return arbitrary(ctx, e, i32Type);
    case INTERNAL_FNS.wasm_i64:
        return arbitrary(ctx, e, i64Type);
    case INTERNAL_FNS.wasm_f32:
        return arbitrary(ctx, e, f32Type);
    case INTERNAL_FNS.wasm_f64:
        return arbitrary(ctx, e, f64Type);

    case INTERNAL_FNS.wasm_ssp:
        return discard ? [] : [Instructions.global.get(ctx.gen.shadowStackPtr)];

    case INTERNAL_FNS.wasm_rload:
        if (e.args[0].type instanceof CPointer) {
            const instr = ctx.expression(e.args[0], false);
            const type = e.args[0].type.type;
            if (type instanceof CStruct || type instanceof CUnion) {
                instr.push(Instructions.i32.load(2, 0));
            }
            return instr;
        }
        throw new GenError("__wasm_rload__ argument should be pointer");

    default:
        return undefined;

    }
}
