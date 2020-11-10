import {CType, CArithmetic} from "../tree/types";
import {Instructions} from "../wasm";
import * as wasm from "../wasm";
import {WExpression} from "../wasm/instructions";

export function getType(type: CType): wasm.ValueType {
    if (type instanceof CArithmetic) {
        return valueType(type);
    }
    // TODO non arithmetic types
    throw new Error("TODO");
}

export function conversion(inType: CType, outType: CType): WExpression {
    if (inType.equals(outType)) return [];

    if (inType instanceof CArithmetic && outType instanceof CArithmetic) {
        return arithmeticConversion(inType, outType);
    }

    throw new Error("TODO");
}

/**
 * Behaves normally, following either the standard or what MSVC does, apart from:
 * - float -> unsigned integer conversion, uses the saturating truncation instructions to avoid traps
 */
export function arithmeticConversion(inType: CArithmetic, outType: CArithmetic): WExpression {
    if (CArithmetic.Fp64.equals(outType)) {
        if (CArithmetic.Fp32.equals(inType)) return [Instructions.f64.promote_f32()];
        if (inType.type === "signed" && inType.bytes === 8) return [Instructions.f64.convert_i64_s()];
        if (inType.type === "unsigned" && inType.bytes === 8) return [Instructions.f64.convert_i64_u()];
        if (inType.type === "signed" && inType.bytes <= 4) return [Instructions.f64.convert_i32_s()];
        if (inType.type === "unsigned" && inType.bytes <= 4) return [Instructions.f64.convert_i32_u()];

    } else if (CArithmetic.Fp32.equals(outType)) {
        if (CArithmetic.Fp64.equals(inType)) return [Instructions.f32.demote_f64()];
        if (inType.type === "signed" && inType.bytes === 8) return [Instructions.f32.convert_i64_s()];
        if (inType.type === "unsigned" && inType.bytes === 8) return [Instructions.f32.convert_i64_u()];
        if (inType.type === "signed" && inType.bytes <= 4) return [Instructions.f32.convert_i32_s()];
        if (inType.type === "unsigned" && inType.bytes <= 4) return [Instructions.f32.convert_i32_u()];

    } else if (CArithmetic.U64.equals(outType)) {
        if (CArithmetic.Fp64.equals(inType)) return [Instructions.i64.trunc_sat_f64_u()];
        if (CArithmetic.Fp32.equals(inType)) return [Instructions.i64.trunc_sat_f32_u()];
        if (CArithmetic.S64.equals(inType)) return [];
        if (inType.type === "signed") return [Instructions.i64.extend_i32_u()];
        if (inType.type === "unsigned") return [Instructions.i64.extend_i32_u()];

    } else if (CArithmetic.S64.equals(outType)) {
        if (CArithmetic.Fp64.equals(inType)) return [Instructions.i64.trunc_f64_s()];
        if (CArithmetic.Fp32.equals(inType)) return [Instructions.i64.trunc_f32_s()];
        if (CArithmetic.U64.equals(inType)) return [];
        if (inType.type === "signed") return [Instructions.i64.extend_i32_s()];
        if (inType.type === "unsigned") return [Instructions.i64.extend_i32_u()];

    } else if (CArithmetic.U32.equals(outType)) {
        if (CArithmetic.Fp64.equals(inType)) return [Instructions.i32.trunc_sat_f64_u()];
        if (CArithmetic.Fp32.equals(inType)) return [Instructions.i32.trunc_sat_f32_u()];
        if (inType.bytes === 8) return [Instructions.i32.wrap_i64()];
        return [];

    } else if (CArithmetic.S32.equals(outType)) {
        if (CArithmetic.Fp64.equals(inType)) return [Instructions.i32.trunc_f64_s()];
        if (CArithmetic.Fp32.equals(inType)) return [Instructions.i32.trunc_f32_s()];
        if (inType.bytes === 8) return [Instructions.i32.wrap_i64()];
        return [];

    } else if (outType.type === "signed" && outType.bytes < 4) {
        const conversion = [
            Instructions.i32.const(32 - (8 * outType.bytes)),
            Instructions.i32.shl(),
            Instructions.i32.const(32 - (8 * outType.bytes)),
            Instructions.i32.shr_s(),
        ];

        if (CArithmetic.Fp64.equals(inType)) conversion.unshift(Instructions.i32.trunc_f64_s());
        if (CArithmetic.Fp32.equals(inType)) conversion.unshift(Instructions.i32.trunc_f32_s());
        if (inType.type !== "float" && inType.bytes === 8) conversion.unshift(Instructions.i32.wrap_i64());
        return conversion;

    } else if (outType.type === "unsigned" && outType.bytes < 4) {
        const conversion = [
            Instructions.i32.const(32 - (8 * outType.bytes)),
            Instructions.i32.shl(),
            Instructions.i32.const(32 - (8 * outType.bytes)),
            Instructions.i32.shr_u(),
        ];

        if (CArithmetic.Fp64.equals(inType)) conversion.unshift(Instructions.i32.trunc_sat_f64_u());
        if (CArithmetic.Fp32.equals(inType)) conversion.unshift(Instructions.i32.trunc_sat_f32_u());
        if (inType.type !== "float" && inType.bytes === 8) conversion.unshift(Instructions.i32.wrap_i64());
        return conversion;
    }

    throw new Error("TODO");
}

export function valueType(type: CType): wasm.ValueType {
    if (!(type instanceof CArithmetic)) throw new Error("Expected arithmetic type");

    if (type.type === "float") {
        return type.bytes === 4 ? wasm.f32Type : wasm.f64Type;
    } else if (type.bytes === 8) {
        return wasm.i64Type;
    } else if (type.bytes <= 4) {
        return wasm.i32Type;
    }

    throw new Error("Unknown type");
}
