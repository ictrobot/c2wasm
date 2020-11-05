import {byte, u32, labelidx, funcidx, typeidx, localidx, globalidx, i32, i64, f32, f64} from "./base_types";
import {encodeU32, encodeI32, encodeI64, encodeF32, encodeF64} from "./encoding";
import {ValueType} from "./wtypes";

export type Instruction = byte[] & {__type_instr__: void};

export const Instructions = {
    // control instructions
    unreachable: zeroArgs(0x00),
    nop: zeroArgs(0x01),
    block(type: ValueType | undefined, body: Instruction[]): Instruction {
        return [0x02 as byte, ...encodeBlockType(type), ...body.flat(), 0x0B as byte] as Instruction;
    },
    loop(type: ValueType | undefined, body: Instruction[]): Instruction {
        return [0x03 as byte, ...encodeBlockType(type), ...body.flat(), 0x0B as byte] as Instruction;
    },
    if(type: ValueType | undefined, body: Instruction[], elseBody?: Instruction[]): Instruction {
        const instr = [0x04 as byte, ...encodeBlockType(type), ...body.flat()] as Instruction;
        if (elseBody) {
            instr.push(0x05 as byte, ...elseBody.flat());
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
        grow: zeroArgs(0x40, 0x00)
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


        const(x: i32): Instruction {
            return [0x41 as byte, ...encodeI32(x)] as Instruction;
        }
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


        const(x: i64): Instruction {
            return [0x42 as byte, ...encodeI64(x)] as Instruction;
        }
    } as const,

    f32: {
        load: memArg(0x2A),
        store: memArg(0x38),


        const(x: f32): Instruction {
            return [0x43 as byte, ...encodeF32(x)] as Instruction;
        }
    } as const,
    f64: {
        load: memArg(0x2B),
        store: memArg(0x39),


        const(x: f64): Instruction {
            return [0x44 as byte, ...encodeF64(x)] as Instruction;
        }
    } as const

} as const;


function encodeBlockType(t: ValueType | undefined): byte[] {
    if (t === undefined) return [0x40 as byte];
    return [t];
}

function zeroArgs(opcode: number, ...extra: number[]): () => Instruction {
    // always return the same instance
    const instr = [opcode, ...extra] as Instruction;
    return () => instr;
}

// either an index or an object with that index
type index<T extends u32> = T | {getIndex(): T};

function encodeIndex<T extends u32>(idx: index<T>): byte[] {
    // @ts-ignore typescript doesn't understand that u32 is really bigint
    const value: T = typeof idx === "bigint" ? idx : idx.getIndex();
    return encodeU32(value);
}

function indexArg<T extends u32>(opcode: number): (x: index<T>) => Instruction {
    return (i) => [opcode as byte, ...encodeIndex(i)] as Instruction;
}

function memArg(opcode: number): (align: u32, offset: u32) => Instruction {
    return (align, offset) => [opcode as byte, ...encodeU32(align), ...encodeU32(offset)] as Instruction;
}
