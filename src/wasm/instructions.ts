import {byte, u32, labelidx, funcidx, typeidx, localidx, globalidx} from "./base_types";
import {encodeU32} from "./encoding";
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
    },
    global: {
        get: indexArg<globalidx>(0x23),
        set: indexArg<globalidx>(0x24),
    }


    // memory instructions
    // ...
} as const;


function encodeBlockType(t: ValueType | undefined): byte[] {
    if (t === undefined) return [0x40 as byte];
    return [t];
}

function zeroArgs(opcode: number): () => Instruction {
    // always return the same instance
    const instr = [opcode] as Instruction;
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
