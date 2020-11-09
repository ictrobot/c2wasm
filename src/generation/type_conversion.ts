import {CType, CArithmetic} from "../tree/types";
import * as wasm from "../wasm";

export function getType(type: CType): wasm.ValueType {
    if (type instanceof CArithmetic) {
        return valueType(type);
    }
    // TODO non arithmetic types
    throw "TODO";
}

export function valueType(type: CType): wasm.ValueType {
    if (!(type instanceof CArithmetic)) throw new Error("Expected arthimetic type");

    if (type.type === "float") {
        return type.bytes === 4 ? wasm.f32Type : wasm.f64Type;
    } else if (type.bytes === 8) {
        return wasm.i64Type;
    } else if (type.bytes === 4) {
        return wasm.i32Type;
    }
    // TODO smaller types
    throw "TODO";
}
