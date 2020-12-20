import {CType, CArithmetic, CPointer, CArray, CVoid, CFuncType, CStruct, CUnion} from "../tree/types";
import {Instructions, ValueType, f32Type, f64Type, i64Type, i32Type} from "../wasm";
import {WInstruction} from "../wasm/instructions";
import {ResultType} from "../wasm/wtypes";

// CType - CArithmetic + wasm.ValueType
export type ImplementationType = CPointer | CArray | CStruct | CUnion | CVoid | CFuncType | ValueType;

/**
 * Types used when computing the type of WebAssembly expressions.
 * CArithmetic is mapped to corresponding WebAssembly ValueTypes.
 * Otherwise the same C types are used.
 */
export function implType(type: CType): ImplementationType {
    if (type instanceof CArithmetic) return valueType(type);
    return type;
}

/**
 * WebAssembly Types used for passing values as a parameter into a function, or storing on the stack.
 */
export function realType(type: CType): ValueType {
    if (type instanceof CArithmetic) return valueType(type);
    if (type instanceof CPointer) return i32Type;
    if (type instanceof CStruct || type instanceof CUnion) {
        // passed around as pointer
        return i32Type;
    }
    if (type instanceof CVoid) throw new Error("Void cannot be stored");
    throw new Error(type.typeName + " doesn't have a real type");
}

export function conversion(inType: CType, outType: CType): WInstruction[] {
    if (inType.equals(outType)) return [];

    if (inType instanceof CArithmetic && outType instanceof CArithmetic) {
        return arithmeticConversion(inType, outType);
    } else if (inType instanceof CArithmetic && inType.type !== "float" && outType instanceof CPointer) {
        // convert int to pointer
        if (inType.bytes > 4) return [Instructions.i32.wrap_i64()]; // check for converting 8 byte int
        return [];
    } else if (outType instanceof CArithmetic && outType.type !== "float" && inType instanceof CPointer) {
        // convert pointer to int
        return [];
    } else if (outType instanceof CPointer && inType instanceof CPointer) {
        // pointer.type change
        return [];
    } else if (inType instanceof CFuncType && outType instanceof CPointer && inType.equals(outType.type)) {
        // fn to pointer (function should already a pointer)
        return [];
    }

    throw new Error(`Cannot convert ${inType.typeName} to ${outType.typeName}`);
}

/**
 * Follows the standard. For float -> int conversion it uses saturating truncation instructions to avoid runtime traps.
 *
 * > 3.2.1.3 Floating and integral
 * >
 * > When a value of floating type is converted to integral type, the fractional part is discarded.
 * > If the value of the integral part cannot be represented by the integral type, the behavior is undefined.
 */
function arithmeticConversion(inType: CArithmetic, outType: CArithmetic): WInstruction[] {
    if (CArithmetic.BOOL.equals(outType)) {
        if (CArithmetic.Fp64.equals(inType)) return [Instructions.f64.const(0), Instructions.f64.ne()];
        if (CArithmetic.Fp32.equals(inType)) return [Instructions.f32.const(0), Instructions.f32.ne()];
        if (inType.bytes === 8) return [Instructions.i64.const(0n), Instructions.i64.ne()];
        return [Instructions.i32.const(0), Instructions.i32.ne()];

    } else if (CArithmetic.Fp64.equals(outType)) {
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
        if (CArithmetic.Fp64.equals(inType)) return [Instructions.i32.trunc_sat_f64_s()];
        if (CArithmetic.Fp32.equals(inType)) return [Instructions.i32.trunc_sat_f32_s()];
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

    throw new Error("Invalid arithmetic type");
}

export function valueType(type: CArithmetic): ValueType {
    if (type.type === "float") {
        return type.bytes === 4 ? f32Type : f64Type;
    } else if (type.bytes === 8) {
        return i64Type;
    } else if (type.bytes <= 4) {
        return i32Type;
    }

    throw new Error("Unknown type");
}

export function returnType(type: CType): ResultType {
    if (type instanceof CVoid) return [];
    return [realType(type)];
}
