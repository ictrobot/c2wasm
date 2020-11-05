import type {byte, u32} from "./base_types";
import {encodeU32} from "./encoding";

export type ValueType = byte & { __type_value_type__: void };
export const i32Type = 0x7F as ValueType;
export const i64Type = 0x7E as ValueType;
export const f32Type = 0x7D as ValueType;
export const f64Type = 0x7C as ValueType;


export type ResultType = ValueType[];

export function encodeResultType(r: ResultType): byte[] {
    return encodeVec(r.map(x => [x]));
}


export type FunctionType = [parameters: ResultType, results: ResultType];

export function encodeFunctionType(f: FunctionType): byte[] {
    return [0x60 as byte, ...encodeResultType(f[0]), ...encodeResultType(f[1])];
}


export type Limits = [minimum: u32, maximum?: u32];
export type MemoryType = Limits;

export function encodeLimits(l: Limits): byte[] {
    if (l[1] === undefined) {
        return [0x00 as byte, ...encodeU32(l[0])];
    } else {
        return [0x01 as byte, ...encodeU32(l[0]), ...encodeU32(l[1])];
    }
}


export type GlobalType = [type: ValueType, mutable: boolean];

export function encodeGlobal(g: GlobalType): byte[] {
    return [g[0], g[1] ? 0x01 as byte : 0x00 as byte];
}


export function encodeVec(values: byte[][]): byte[] {
    return [...encodeU32(BigInt(values.length) as u32), ...values.flat()];
}
