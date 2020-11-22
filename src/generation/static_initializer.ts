import {ParseNode} from "../parsing";
import {CConstant, CInitializer, CArrayPointer, CStringLiteral, CExpression, CValue, CCast, CAddressOf, CIdentifier, CAddSub, CDereference} from "../tree/expressions";
import {constExpression, normalizeValueType} from "../tree/transform/constant_expressions";
import {ExpressionTypeError} from "../tree/type_checking";
import {CEnum, CArithmetic, CArray, CUnion, CStruct, CSizeT, CPointer, CType} from "../tree/types";
import {byte} from "../wasm/base_types";
import {GenError} from "./gen_error";
import {WGenerator} from "./generator";
import {getStaticAddress} from "./storage";

export function staticInitializer(ctx: WGenerator, init: CExpression | CInitializer, targetType?: CType, nested = false): byte[] {
    if (init instanceof CInitializer) {
        if (targetType && !init.type.equals(targetType)) throw new GenError("Static initializer type mismatch", undefined, init.node);
        return initializer(ctx, init, nested);
    } else if (init instanceof CArrayPointer && init.arrayIdentifier instanceof CStringLiteral) {
        // string literal being used as pointer
        return stringLiteralPtr(ctx, init);
    } else if (init instanceof CStringLiteral) {
        // string literal being used as array
        return stringLiteral(init);
    } else {
        if (targetType && !init.type.equals(targetType)) init = new CCast(init.node, targetType, init);
        const value = constExpression(init, staticExpressions(ctx));
        return constant(value, init.node);
    }
}

function staticExpressions(ctx: WGenerator): (e: CExpression) => CValue {
    const extra = (e: CExpression) => {
        if (e instanceof CAddressOf && e.body instanceof CIdentifier) {
            let addr: number | bigint | undefined;
            if (e.body.value.declType === "variable") {
                addr = getStaticAddress(e.body.value);
            } else {
                addr = ctx.indirectIndex(e.body.value);
            }
            if (addr !== undefined) return normalizeValueType({value: addr, type: e.type});

        } else if (e instanceof CAddressOf && e.body instanceof CDereference) { // &x[3] turns into &*(x + 3)
            const v = constExpression(e.body.body, extra);
            return normalizeValueType({value: v.value, type: e.type});

        } else if (e instanceof CIdentifier && e.value.declType === "function") { // implicit function to pointer conversion
            const addr = ctx.indirectIndex(e.value);
            return normalizeValueType({value: addr, type: new CPointer(e.node, e.type)});

        } else if (e instanceof CArrayPointer && e.arrayIdentifier instanceof CIdentifier) { // implicit array to pointer conversion
            const addr = getStaticAddress(e.arrayIdentifier.value);
            if (addr !== undefined) return normalizeValueType({value: addr, type: new CPointer(e.node, e.type)});

        } else if (e instanceof CArrayPointer && e.arrayIdentifier instanceof CStringLiteral) {
            // allocate a new string literal and return pointer
            const addr = ctx.nextStaticAddr;
            const stringBytes = stringLiteral(e.arrayIdentifier);
            ctx.module.dataSegment(addr, stringBytes);
            ctx.nextStaticAddr += Math.ceil(stringBytes.length / 4) * 4;
            return normalizeValueType({value: addr, type: e.type});

        } else if (e instanceof CAddSub && e.type instanceof CPointer) { // pointer arithmetic
            const lhs = constExpression(e.lhs, extra), rhs = constExpression(e.rhs, extra);
            const lhsValue = lhs.type instanceof CPointer ? BigInt(lhs.value) : BigInt(e.type.type.bytes) * BigInt(lhs.value);
            const rhsValue = rhs.type instanceof CPointer ? BigInt(rhs.value) : BigInt(e.type.type.bytes) * BigInt(rhs.value);
            return normalizeValueType({value: lhsValue + rhsValue, type: e.type});
        }

        throw new ExpressionTypeError(e.node, "constant expression");
    };
    return extra;
}

function encode(bytes: number, method: (d: DataView) => void): byte[] {
    const buffer = new ArrayBuffer(bytes);
    method(new DataView(buffer));
    return [...new Uint8Array(buffer)] as byte[];
}

function constant(c: CValue, node?: ParseNode): byte[] {
    if (CArithmetic.S64.equals(c.type)) {
        return encode(8, d => d.setBigInt64(0, BigInt(c.value), true));
    } else if (CArithmetic.U64.equals(c.type)) {
        return encode(8, d => d.setBigUint64(0, BigInt(c.value), true));
    } else if (CArithmetic.S32.equals(c.type) || c.type instanceof CEnum) {
        return encode(4, d => d.setInt32(0, Number(c.value), true));
    } else if (CArithmetic.U32.equals(c.type) || c.type instanceof CPointer) {
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
        return encode(8, d => d.setFloat64(0, Number(c.value), true));
    } else if (CArithmetic.Fp32.equals(c.type)) {
        return encode(4, d => d.setFloat32(0, Number(c.value), true));
    } else if (CArithmetic.BOOL.equals(c.type)) {
        // eslint-disable-next-line eqeqeq
        return encode(4, d => d.setInt32(0, c.value == 0 ? 0 : 1, true));
    }
    throw new GenError("Unknown value type?", undefined, node);
}

function stringLiteralPtr(ctx: WGenerator, init: CArrayPointer): byte[] {
    if (!(init.arrayIdentifier instanceof CStringLiteral)) throw new GenError("Invalid initializer", undefined, init.node);

    const addr = ctx.nextStaticAddr;
    const stringBytes = stringLiteral(init.arrayIdentifier);
    ctx.module.dataSegment(addr, stringBytes);

    ctx.nextStaticAddr += Math.ceil(stringBytes.length / 4) * 4;
    return constant(new CConstant(init.node, CSizeT, BigInt(addr)));
}

function stringLiteral(s: CStringLiteral): byte[] {
    return s.value.map(Number) as byte[];
}

function initializer(ctx: WGenerator, init: CInitializer, nested: boolean): byte[] {
    let bytes: byte[];

    if (init.type instanceof CArray) {
        if (init.type.length === undefined) throw new GenError("Array length still unknown?", undefined, init.node);
        bytes = init.body.flatMap((x, i) => staticInitializer(ctx, x, init.memberTypes[i], true));

    } else if (init.type instanceof CUnion) {
        bytes = staticInitializer(ctx, init.body[0], init.memberTypes[0], true);

    } else if (init.type instanceof CStruct) {
        bytes = init.body.flatMap((x, i) => staticInitializer(ctx, x, init.memberTypes[i],true));

    } else {
        throw new GenError("Invalid initializer", undefined, init.node);
    }

    if (nested) {
        const zeros = Array(init.type.bytes - bytes.length).fill(0);
        bytes.push(...zeros);
    }
    return bytes;
}
