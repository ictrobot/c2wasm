import {CFuncDefinition, CFuncDeclaration} from "../tree/declarations";
import {CFunctionCall, CIdentifier, CConstant} from "../tree/expressions";
import {INTERNAL_FNS} from "../tree/internal_scope";
import {CArithmetic} from "../tree/types";
import {byte} from "../wasm/base_types";
import {WExpression} from "../wasm/instructions";
import {WFnGenerator} from "./generator";

export function internalFunctions(ctx: WFnGenerator, e: CFunctionCall, discard: boolean): WExpression | undefined {
    if (!(e.body instanceof CIdentifier) || !(e.body.value instanceof CFuncDefinition || e.body.value instanceof CFuncDeclaration)) {
        throw new Error("Invalid fn call identifier");
    }
    switch (e.body.value) {

    case INTERNAL_FNS.wasm:
    case INTERNAL_FNS.wasm_i32:
    case INTERNAL_FNS.wasm_i64:
    case INTERNAL_FNS.wasm_f32:
    case INTERNAL_FNS.wasm_f64:
        return [() => e.args.map(x => {
            if (x instanceof CConstant) return Number(x.changeType(CArithmetic.U8).value);
            throw new Error("__wasm__ can only be called with constant values");
        }) as byte[]];

    case INTERNAL_FNS.wasm_push:
        if (!(e.args[0] instanceof CConstant)) throw new Error("__wasm_push__ first argument should be integer constant");
        if (e.args.length !== Number(e.args[0].value) + 1) throw new Error("__wasm_push__ length doesn't match arguments provided");
        return e.args.slice(1).flatMap(x => ctx.expression(x, false));

    default:
        return undefined;

    }
}
