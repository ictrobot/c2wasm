import {CFunctionCall, CIdentifier, CConstant} from "../tree/expressions";
import {INTERNAL_FNS} from "../tree/internal_scope";
import {CArithmetic, CStruct, CUnion, CPointer} from "../tree/types";
import {byte} from "../wasm/base_types";
import {WInstruction, Instructions} from "../wasm/instructions";
import {GenError} from "./gen_error";
import {WFnGenerator} from "./generator";

export function internalFunctions(ctx: WFnGenerator, e: CFunctionCall, discard: boolean): WInstruction[] | undefined {
    if (!(e.body instanceof CIdentifier)) return undefined; // indirect call

    switch (e.body.value) {

    case INTERNAL_FNS.wasm:
    case INTERNAL_FNS.wasm_i32:
    case INTERNAL_FNS.wasm_i64:
    case INTERNAL_FNS.wasm_f32:
    case INTERNAL_FNS.wasm_f64:
        return [() => e.args.map(x => {
            if (x instanceof CConstant) return Number(x.changeType(CArithmetic.U8).value);
            throw new GenError("__wasm__ can only be called with constants", ctx, x.node);
        }) as byte[]];

    case INTERNAL_FNS.wasm_push:
        if (!(e.args[0] instanceof CConstant)) {
            throw new GenError("__wasm_push__ first argument should be integer constant", ctx, e.args[0].node);
        } else if (e.args.length !== Number(e.args[0].value) + 1) {
            throw new GenError("__wasm_push__ length doesn't match arguments provided", ctx, e.node);
        }
        return e.args.slice(1).flatMap(x => ctx.expression(x, false));

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
