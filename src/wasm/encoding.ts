import {byte, u32, u64, s32, s64, f32, f64} from "./wtypes";

export function encodeF32(n: f32): byte[] {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, n, true);
    return [...new Uint8Array(buffer)] as byte[];
}

export function encodeF64(n: f64): byte[] {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, n, true);
    return [...new Uint8Array(buffer)] as byte[];
}

export function encodeU32(n: u32): byte[] {
    if (n > 2n ** 32n - 1n || n < 0n) {
        throw new Error(`Value ${n} outside of range for u32`);
    }
    return unsignedLeb128(n) as byte[];
}

export function encodeU64(n: u64): byte[] {
    if (n > 2n ** 64n - 1n || n < 0n) {
        throw new Error(`Value ${n} outside of range for u64`);
    }
    return unsignedLeb128(n) as byte[];
}

export function encodeS32(n: s32): byte[] {
    if (n > 2n ** 31n - 1n || n < -(2n ** 31n)) {
        throw new Error(`Value ${n} outside of range for s32`);
    }
    return signedLeb128(n) as byte[];
}

export function encodeS64(n: s64): byte[] {
    if (n > 2n ** 63n - 1n || n < -(2n ** 63n)) {
        throw new Error(`Value ${n} outside of range for s64`);
    }
    return signedLeb128(n) as byte[];
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
    result.unshift(...encodeU32(BigInt(result.length) as u32));
    return result as byte[];
}

function unsignedLeb128(n: bigint): number[] {
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

function signedLeb128(n: bigint): number[] {
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
