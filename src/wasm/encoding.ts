import type {byte} from "./base_types";
import {ValueType, i32Type, i64Type, f32Type, f64Type} from "./wtypes";

export function encodeF32(n: number): byte[] {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, n, true);
    return [...new Uint8Array(buffer)] as byte[];
}

export function encodeF64(n: number): byte[] {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, n, true);
    return [...new Uint8Array(buffer)] as byte[];
}

// unsigned 32 bit integer, used in wasm module format
export function encodeU32(n: bigint): byte[] {
    if (n > 2n ** 32n - 1n || n < 0n) {
        throw new Error(`Value ${n} outside of range for u32`);
    }
    return unsignedLeb128(n) as byte[];
}

// "uninterpreted" values, i.e. could be signed or not signed. Stored as signed. Used for constants
export function encodeInt32Constant(n: bigint | number): byte[] {
    if (typeof n === "number") n = BigInt(n);

    if (n < 2n ** 32n && n > 2n ** 31n - 1n) {
        // need to reinterpret unsigned number as a signed number
        n -= 2n ** 32n;
    } else if (n > 2n ** 31n - 1n || n < -(2n ** 31n)) {
        throw new Error(`Value ${n} outside of range for 32bit uninterpreted int`);
    }
    return signedLeb128(n) as byte[];
}

export function encodeInt64Constant(n: bigint): byte[] {
    if (n < 2n ** 64n && n > 2n ** 63n - 1n) {
        // need to reinterpret unsigned number as a signed number
        n -= 2n ** 64n;
    } else if (n > 2n ** 63n - 1n || n < -(2n ** 63n)) {
        throw new Error(`Value ${n} outside of range for 64bit uninterpreted int`);
    }
    return signedLeb128(n) as byte[];
}

export function encodeConstantInstr(n: number | bigint, type: ValueType): byte[] {
    if (type === i32Type) {
        return [0x41 as byte, ...encodeInt32Constant(n)];
    } else if (type === i64Type && typeof n === "bigint") {
        return [0x42 as byte, ...encodeInt64Constant(n)];
    } else if (type === f32Type && typeof n === "number") {
        return [0x43 as byte, ...encodeF32(n)];
    } else if (type === f64Type && typeof n === "number") {
        return [0x44 as byte, ...encodeF64(n)];
    } else {
        throw new Error(`Invalid value type (${type.toString(16)}) or initial value (${n})`);
    }
}

export function encodeUtf8(str: string): byte[] {
    // modified from https://developer.mozilla.org/en-US/docs/Web/API/TextEncoder#Polyfill
    const result = [];
    for (let point = 0, nextcode = 0, i = 0; i < str.length;) {
        point = str.charCodeAt(i++);
        if (point >= 0xD800 && point <= 0xDBFF) {
            if (i === str.length) {
                result.push(0xef, 0xbf, 0xbd);
                break;
            }
            nextcode = str.charCodeAt(i);
            if (nextcode >= 0xDC00 && nextcode <= 0xDFFF) {
                point = (point - 0xD800) * 0x400 + nextcode - 0xDC00 + 0x10000;
                i += 1;
                if (point > 0xffff) {
                    result.push((0x1e << 3) | (point >>> 18), (0x2 << 6) | ((point >>> 12) & 0x3f), (0x2 << 6) | ((point >>> 6) & 0x3f), (0x2 << 6) | (point & 0x3f));
                    continue;
                }
            } else {
                result.push(0xef, 0xbf, 0xbd);
                continue;
            }
        }
        if (point <= 0x007f) {
            result.push((0x0 << 7) | point);
        } else if (point <= 0x07ff) {
            result.push((0x6 << 5) | (point >>> 6), (0x2 << 6) | (point & 0x3f));
        } else {
            result.push((0xe << 4) | (point >>> 12), (0x2 << 6) | ((point >>> 6) & 0x3f), (0x2 << 6) | (point & 0x3f));
        }
    }
    // WebAssembly stores strings as a vector of bytes, so need to add the length
    // (stored as u32) at the start
    result.unshift(...encodeU32(BigInt(result.length)));
    return result as byte[];
}

export function unsignedLeb128(n: bigint): number[] {
    const result: number[] = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const byte = Number(n & 0x7Fn);
        n >>= 7n;
        if (n === 0n) {
            result.push(byte);
            return result;
        }
        result.push(byte | 0x80);
    }
}

export function signedLeb128(n: bigint): number[] {
    const result: number[] = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const byte = Number(n & 0x7Fn);
        n >>= 7n;
        if ((n === 0n && (byte & 0x40) === 0) || (n === -1n && (byte & 0x40) !== 0)) {
            result.push(byte);
            return result;
        }
        result.push(byte | 0x80);
    }
}
