import {CConstant, CInitializer} from "../tree/expressions";
import {CEnum, CArithmetic, CArray} from "../tree/types";
import {byte} from "../wasm/base_types";

export function staticInitializer(init: CConstant | CInitializer): byte[] {
    if (init instanceof CConstant) {
        return constant(init);
    } else {
        return initializer(init);
    }
}

function encode(bytes: number, method: (d: DataView) => void): byte[] {
    const buffer = new ArrayBuffer(bytes);
    method(new DataView(buffer));
    return [...new Uint8Array(buffer)] as byte[];
}

function constant(c: CConstant): byte[] {
    if (CArithmetic.S64.equals(c.type)) {
        return encode(8, d => d.setBigInt64(0, BigInt(c.value), true));
    } else if (CArithmetic.U64.equals(c.type)) {
        return encode(8, d => d.setBigUint64(0, BigInt(c.value), true));
    } else if (CArithmetic.S32.equals(c.type) || c.type instanceof CEnum) {
        return encode(4, d => d.setInt32(0, Number(c.value), true));
    } else if (CArithmetic.U32.equals(c.type)) {
        return encode(4, d => d.setUint32(0, Number(c.value), true));
    } else if (CArithmetic.S16.equals(c.type)) {
        return encode(2, d => d.setInt16(0, Number(c.value), true));
    } else if (CArithmetic.U16.equals(c.type)) {
        return encode(2, d => d.setUint16(0, Number(c.value), true));
    } else if (CArithmetic.S8.equals(c.type)) {
        return encode(1, d => d.setInt8(0, Number(c.value)));
    } else if (CArithmetic.U8.equals(c.type)) {
        return encode(1, d => d.setUint8(0, Number(c.value)));
    } else if (CArithmetic.Fp64.equals(c.type)) {
        return encode(8, d => d.setFloat64(0, Number(c.value)));
    } else if (CArithmetic.Fp32.equals(c.type)) {
        return encode(4, d => d.setFloat32(0, Number(c.value)));
    }
    throw new Error("Unknown value type?");
}

function initializer(init: CInitializer): byte[] {
    if (init.type instanceof CArray) {
        if (init.type.length === undefined) throw new Error("Array length still unknown?");

        const bytes: byte[] = init.body.flatMap((x) => {
            if (x instanceof CConstant || x instanceof CInitializer) return staticInitializer(x);
            throw new Error("Invalid static array initializer");
        });

        const zeros = Array(init.type.type.bytes).fill(0);
        for (let i = init.body.length; i < init.type.length; i++) {
            bytes.push(...zeros);
        }
        return bytes;
    }
    throw new Error("TODO");
}
