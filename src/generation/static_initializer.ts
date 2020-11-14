import {CConstant, CInitializer, CArrayPointer, CStringLiteral} from "../tree/expressions";
import {CEnum, CArithmetic, CArray, CUnion, CStruct, CSizeT} from "../tree/types";
import {byte} from "../wasm/base_types";
import {WGenerator} from "./generator";

export function staticInitializer(ctx: WGenerator, init: CConstant | CInitializer | CArrayPointer, nested = false): byte[] {
    if (init instanceof CConstant) {
        return constant(init);
    } else if (init instanceof CArrayPointer) {
        return stringLiteral(ctx, init);
    } else {
        return initializer(ctx, init, nested);
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

function stringLiteral(ctx: WGenerator, init: CArrayPointer): byte[] {
    // very similar code to generation/expressions.ts stringLiteral(...)
    if (!(init.arrayIdentifier instanceof CStringLiteral)) throw new Error("Invalid initializer");

    const addr = ctx.nextStaticAddr;
    ctx.nextStaticAddr += Math.ceil(init.arrayIdentifier.value.length / 4) * 4;

    ctx.module.dataSegment(addr, init.arrayIdentifier.value.map(Number));
    return constant(new CConstant(init.node, CSizeT, BigInt(addr)));
}

function initializer(ctx: WGenerator, init: CInitializer, nested: boolean): byte[] {
    let bytes: byte[];

    if (init.type instanceof CArray) {
        if (init.type.length === undefined) throw new Error("Array length still unknown?");

        bytes = init.body.flatMap((x) => {
            if (x instanceof CConstant || x instanceof CInitializer) return staticInitializer(ctx, x, true);
            throw new Error("Invalid static array initializer");
        });

    } else if (init.type instanceof CUnion) {
        if (init.body[0] instanceof CConstant || init.body[0] instanceof CInitializer) {
            bytes = staticInitializer(ctx, init.body[0], true);
        } else {
            throw new Error("Invalid static union initializer");
        }

    } else if (init.type instanceof CStruct) {
        bytes = init.body.flatMap((x) => {
            if (x instanceof CConstant || x instanceof CInitializer) return staticInitializer(ctx, x, true);
            throw new Error("Invalid static struct initializer");
        });

    } else {
        throw new Error("Invalid initializer");
    }

    if (nested) {
        const zeros = Array(init.type.bytes - bytes.length).fill(0);
        bytes.push(...zeros);
    }
    return bytes;
}
