import {byte, labelidx, funcidx, typeidx, localidx, globalidx} from "./base_types";
import {encodeU32, encodeF32, encodeF64, encodeInt64Constant, encodeInt32Constant} from "./encoding";
import {ValueType} from "./wtypes";

export type WInstruction = ((depth: number) => byte[]);
export type WExpression = WInstruction[];

export const Instructions = {
    // control instructions
    unreachable: zeroArgs(0x00),
    nop: zeroArgs(0x01),
    block: (type: ValueType | null, body: WExpression) => (d: number) => {
        return [0x02 as byte, ...encodeBlockType(type), ...body.map(x => x(d + 1)).flat(), 0x0B as byte];
    },
    loop: (type: ValueType | null, body: WExpression) => (d: number) => {
        return [0x03 as byte, ...encodeBlockType(type), ...body.map(x => x(d + 1)).flat(), 0x0B as byte];
    },
    if: (type: ValueType | null, body: WExpression, elseBody?: WExpression) => (d: number) => {
        const instr = [0x04 as byte, ...encodeBlockType(type), ...body.map(x => x(d + 1)).flat()];
        if (elseBody) {
            instr.push(0x05 as byte, ...elseBody.map(x => x(d + 1)).flat());
        }
        instr.push(0x0B as byte);
        return instr;
    },
    br: indexArg<labelidx>(0x0C),
    br_if: indexArg<labelidx>(0x0D),
    // br_table: {...},
    return: zeroArgs(0x0F),
    call: indexArg<funcidx>(0x10),
    call_indirect: indexArg<typeidx>(0x11),


    // parametric instructions
    drop: zeroArgs(0x1A),
    select: zeroArgs(0x1B),


    // variable instructions
    local: {
        get: indexArg<localidx>(0x20),
        set: indexArg<localidx>(0x21),
        tee: indexArg<localidx>(0x22),
    } as const,
    global: {
        get: indexArg<globalidx>(0x23),
        set: indexArg<globalidx>(0x24),
    } as const,


    // memory instructions
    memory: {
        size: zeroArgs(0x3F, 0x00),
        grow: zeroArgs(0x40, 0x00),
        copy: zeroArgs(0xFC, 0x0A, 0x00, 0x00),
        fill: zeroArgs(0xFC, 0x0B, 0x00)
    } as const,


    i32: {
        load: memArg(0x28),
        load8_s: memArg(0x2C),
        load8_u: memArg(0x2D),
        load16_s: memArg(0x2E),
        load16_u: memArg(0x2F),
        store: memArg(0x36),
        store8: memArg(0x3A),
        store16: memArg(0x3B),


        const: (x: number | bigint) => () => [0x41 as byte, ...encodeInt32Constant(x)],

        eqz: zeroArgs(0x45),
        eq: zeroArgs(0x46),
        ne: zeroArgs(0x47),
        lt_s: zeroArgs(0x48),
        lt_u: zeroArgs(0x49),
        gt_s: zeroArgs(0x4A),
        gt_u: zeroArgs(0x4B),
        le_s: zeroArgs(0x4C),
        le_u: zeroArgs(0x4D),
        ge_s: zeroArgs(0x4E),
        ge_u: zeroArgs(0x4F),

        clz: zeroArgs(0x67),
        ctz: zeroArgs(0x68),
        popcnt: zeroArgs(0x69),
        add: zeroArgs(0x6A),
        sub: zeroArgs(0x6B),
        mul: zeroArgs(0x6C),
        div_s: zeroArgs(0x6D),
        div_u: zeroArgs(0x6E),
        rem_s: zeroArgs(0x6F),
        rem_u: zeroArgs(0x70),
        and: zeroArgs(0x71),
        or: zeroArgs(0x72),
        xor: zeroArgs(0x73),
        shl: zeroArgs(0x74),
        shr_s: zeroArgs(0x75),
        shr_u: zeroArgs(0x76),
        rotl: zeroArgs(0x77),
        rotr: zeroArgs(0x78),

        wrap_i64: zeroArgs(0xA7),
        trunc_f32_s: zeroArgs(0xA8),
        trunc_f32_u: zeroArgs(0xA9),
        trunc_f64_s: zeroArgs(0xAA),
        trunc_f64_u: zeroArgs(0xAB),

        reinterpret_f32: zeroArgs(0xBC),
        extend8_s: zeroArgs(0xC0),
        extend16_s: zeroArgs(0xC1),

        // Non-trapping Float-to-int Conversions
        trunc_sat_f32_s: zeroArgs(0xFC, 0),
        trunc_sat_f32_u: zeroArgs(0xFC, 1),
        trunc_sat_f64_s: zeroArgs(0xFC, 2),
        trunc_sat_f64_u: zeroArgs(0xFC, 3),
    } as const,

    i64: {
        load: memArg(0x29),
        load8_s: memArg(0x30),
        load8_u: memArg(0x31),
        load16_s: memArg(0x32),
        load16_u: memArg(0x33),
        load32_s: memArg(0x34),
        load32_u: memArg(0x35),
        store: memArg(0x37),
        store8: memArg(0x3C),
        store16: memArg(0x3D),
        store32: memArg(0x3E),


        const: (x: bigint) => () => [0x42 as byte, ...encodeInt64Constant(x)],

        eqz: zeroArgs(0x50),
        eq: zeroArgs(0x51),
        ne: zeroArgs(0x52),
        lt_s: zeroArgs(0x53),
        lt_u: zeroArgs(0x54),
        gt_s: zeroArgs(0x55),
        gt_u: zeroArgs(0x56),
        le_s: zeroArgs(0x57),
        le_u: zeroArgs(0x58),
        ge_s: zeroArgs(0x59),
        ge_u: zeroArgs(0x5A),

        clz: zeroArgs(0x79),
        ctz: zeroArgs(0x7A),
        popcnt: zeroArgs(0x7B),
        add: zeroArgs(0x7C),
        sub: zeroArgs(0x7D),
        mul: zeroArgs(0x7E),
        div_s: zeroArgs(0x7F),
        div_u: zeroArgs(0x80),
        rem_s: zeroArgs(0x81),
        rem_u: zeroArgs(0x82),
        and: zeroArgs(0x83),
        or: zeroArgs(0x84),
        xor: zeroArgs(0x85),
        shl: zeroArgs(0x86),
        shr_s: zeroArgs(0x87),
        shr_u: zeroArgs(0x88),
        rotl: zeroArgs(0x89),
        rotr: zeroArgs(0x8A),

        extend_i32_s: zeroArgs(0xAC),
        extend_i32_u: zeroArgs(0xAD),
        trunc_f32_s: zeroArgs(0xAE),
        trunc_f32_u: zeroArgs(0xAF),
        trunc_f64_s: zeroArgs(0xB0),
        trunc_f64_u: zeroArgs(0xB1),

        reinterpret_f64: zeroArgs(0xBD),
        extend8_s: zeroArgs(0xC2),
        extend16_s: zeroArgs(0xC3),
        extend32_s: zeroArgs(0xC4),

        // Non-trapping Float-to-int Conversions
        trunc_sat_f32_s: zeroArgs(0xFC, 4),
        trunc_sat_f32_u: zeroArgs(0xFC, 5),
        trunc_sat_f64_s: zeroArgs(0xFC, 6),
        trunc_sat_f64_u: zeroArgs(0xFC, 7),
    } as const,

    f32: {
        load: memArg(0x2A),
        store: memArg(0x38),


        const: (x: number) => () => [0x43 as byte, ...encodeF32(x)],

        eq: zeroArgs(0x5B),
        ne: zeroArgs(0x5C),
        lt: zeroArgs(0x5D),
        gt: zeroArgs(0x5E),
        le: zeroArgs(0x5F),
        ge: zeroArgs(0x60),

        abs: zeroArgs(0x8B),
        neg: zeroArgs(0x8C),
        ceil: zeroArgs(0x8D),
        floor: zeroArgs(0x8E),
        trunc: zeroArgs(0x8F),
        nearest: zeroArgs(0x90),
        sqrt: zeroArgs(0x91),
        add: zeroArgs(0x92),
        sub: zeroArgs(0x93),
        mul: zeroArgs(0x94),
        div: zeroArgs(0x95),
        min: zeroArgs(0x96),
        max: zeroArgs(0x97),
        copysign: zeroArgs(0x98),

        convert_i32_s: zeroArgs(0xB2),
        convert_i32_u: zeroArgs(0xB3),
        convert_i64_s: zeroArgs(0xB4),
        convert_i64_u: zeroArgs(0xB5),
        demote_f64: zeroArgs(0xB6),

        reinterpret_i32: zeroArgs(0xBE),
    } as const,

    f64: {
        load: memArg(0x2B),
        store: memArg(0x39),


        const: (x: number) => () => [0x44 as byte, ...encodeF64(x)],

        eq: zeroArgs(0x61),
        ne: zeroArgs(0x62),
        lt: zeroArgs(0x63),
        gt: zeroArgs(0x64),
        le: zeroArgs(0x65),
        ge: zeroArgs(0x66),

        abs: zeroArgs(0x99),
        neg: zeroArgs(0x9A),
        ceil: zeroArgs(0x9B),
        floor: zeroArgs(0x9C),
        trunc: zeroArgs(0x9D),
        nearest: zeroArgs(0x9E),
        sqrt: zeroArgs(0x9F),
        add: zeroArgs(0xA0),
        sub: zeroArgs(0xA1),
        mul: zeroArgs(0xA2),
        div: zeroArgs(0xA3),
        min: zeroArgs(0xA4),
        max: zeroArgs(0xA5),
        copysign: zeroArgs(0xA6),

        convert_i32_s: zeroArgs(0xB7),
        convert_i32_u: zeroArgs(0xB8),
        convert_i64_s: zeroArgs(0xB9),
        convert_i64_u: zeroArgs(0xBA),
        promote_f32: zeroArgs(0xBB),

        reinterpret_i64: zeroArgs(0xBF),
    } as const

} as const;


function encodeBlockType(t: ValueType | null): byte[] {
    if (t === null) return [0x40 as byte];
    return [t];
}

function zeroArgs(opcode: number, ...extra: number[]): () => WInstruction {
    // always return the same instance
    const instr = [opcode, ...extra] as byte[];
    const innerFunction = () => instr;
    return () => innerFunction;
}

// either an index (instance of T), an object with a getter for the index
// or a plain number to make the api easier to use
type index<T extends bigint> = number | T | {getIndex(depth: number): T};

function encodeIndex<T extends bigint>(idx: index<T>, depth: number): byte[] {
    let value: T;
    if (typeof idx === "number") {
        value = BigInt(idx) as T;
    } else if (typeof idx === "bigint") {
        value = idx as T;
    } else {
        value = idx.getIndex(depth);
    }
    return encodeU32(value);
}

function indexArg<T extends bigint>(opcode: number): (x: index<T>) => WInstruction {
    return (i) => (depth: number) => [opcode as byte, ...encodeIndex(i, depth)];
}

function memArg(opcode: number): (align: bigint | number, offset: bigint | number) => WInstruction {
    return (align, offset) => () => {
        if (typeof align === "number") align = BigInt(align);
        if (typeof offset === "number") offset = BigInt(offset);

        return [opcode as byte, ...encodeU32(align), ...encodeU32(offset)];
    };
}
