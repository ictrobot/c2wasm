import {labelidx, funcidx, typeidx, localidx, globalidx} from "./base_types";
import {encodeF32, encodeF64, encodeInt64Constant, encodeInt32Constant} from "./encoding";
import {zeroArgs, blockLoopInstr, ifInstr, idxArg, zeroArgsSpecial, memArg, constantArg, PartialInstr, brTableInstr} from "./instr_helpers";
import {i32Type, i64Type, f32Type, f64Type, ValueType} from "./wtypes";

export type WInstruction = PartialInstr;
export {WExpression} from "./instr_helpers";

export const Instructions = {
    // control instructions
    unreachable: zeroArgs("unreachable", [0x00], [], null),
    nop: zeroArgs("nop", [0x01], [], null),
    block: blockLoopInstr(0x02, "block"),
    loop: blockLoopInstr(0x03, "loop"),
    if: ifInstr(0x04, 0x05),
    br: idxArg<labelidx, [] | [ValueType]>("br", [0x0C], [], ({extra}) => ({
        // if this br consumes a result, it must be passed into the function call as it cannot be inferred
        parameters: extra, result: null,
        reads: [], writes: ["jump"]
    })),
    br_if: idxArg<labelidx, []>("br_if",[0x0D], [], () => ({
        parameters: [], result: null,
        reads: [], writes: ["jump"]
    })),
    br_table: brTableInstr(0x0E),
    return: zeroArgsSpecial("return", [0x0F], ({builder}) => ({
        parameters: builder.type[1], result: null,
        reads: [], writes: ["jump"]
    })),
    call: idxArg<funcidx, []>("call", [0x10], [], ({builder, value}) => {
        const func = builder.fn.parent._functionLookup(value); // function that we are calling may write to memory
        return {parameters: func.type[0], result: func.type[1][0] ?? null, reads: [], writes: ["jump", "memory"]};
    }),
    call_indirect: idxArg<typeidx, []>("call_indirect", [0x11], [0x00], ({builder, value}) => {
        const type = builder.fn.parent._typeLookup(value);
        return {parameters: [...type[0], i32Type], result: type[1][0] ?? null, reads: [], writes: ["jump", "memory"]};
    }),


    // parametric instructions
    drop: zeroArgsSpecial("drop", [0x1A], ({stack}) => {
        if (stack.length <= 0) throw new Error("Drop on empty stack");

        return {
            parameters: [stack[stack.length - 1]], result: null,
            reads: [], writes: []
        };
    }),
    // select: zeroArgsSpecial("select", ...),


    // variable instructions
    local: {
        get: idxArg<localidx, []>("local.get", [0x20], [], ({builder, value}) => {
            const local = builder.getLocal(value);
            return {parameters: [], result: local.type, reads: [local], writes: []};
        }),
        set: idxArg<localidx, []>("local.set", [0x21], [], ({builder, value}) => {
            const local = builder.getLocal(value);
            return {parameters: [local.type], result: null, reads: [], writes: [local]};
        }),
        tee: idxArg<localidx, []>("local.tee", [0x22], [], ({builder, value}) => {
            const local = builder.getLocal(value);
            return {parameters: [local.type], result: local.type, reads: [], writes: [local]};
        }),
    } as const,
    global: {
        get: idxArg<globalidx, []>("global.get", [0x23], [], ({builder, value}) => {
            const global = builder.fn.parent._globalLookup(value);
            return {parameters: [], result: global.type, reads: [global], writes: []};
        }),
        set: idxArg<globalidx, []>("global.set", [0x24], [], ({builder, value}) => {
            const global = builder.fn.parent._globalLookup(value);
            return {parameters: [global.type], result: null, reads: [], writes: [global]};
        }),
    } as const,


    // memory instructions
    memory: {
        size: zeroArgs("memory.size",[0x3F, 0x00], [], i32Type, ["memory"], []),
        grow: zeroArgs("memory.grow", [0x40, 0x00], [i32Type], i32Type, ["memory"], ["memory"]),
        copy: zeroArgs("memory.copy", [0xFC, 0x0A, 0x00, 0x00], [i32Type, i32Type, i32Type], null, ["memory"], ["memory"]),
        fill: zeroArgs("memory.fill", [0xFC, 0x0B, 0x00], [i32Type, i32Type, i32Type], null, [], ["memory"])
    } as const,


    i32: {
        load: memArg("i32.load", [0x28],"load", i32Type),
        load8_s: memArg("i32.load8_s", [0x2C], "load", i32Type),
        load8_u: memArg("i32.load8_u", [0x2D], "load", i32Type),
        load16_s: memArg("i32.load16_s", [0x2E], "load", i32Type),
        load16_u: memArg("i32.load16_u", [0x2F], "load", i32Type),
        store: memArg("i32.store", [0x36], "store", i32Type),
        store8: memArg("i32.store8", [0x3A], "store", i32Type),
        store16: memArg("i32.store16", [0x3B], "store", i32Type),

        const: constantArg<number|bigint>("i32.const", [0x41], encodeInt32Constant, BigInt, i32Type),

        eqz: zeroArgs("i32.eqz", [0x45], [i32Type], i32Type),
        eq: zeroArgs("i32.eq", [0x46], [i32Type, i32Type], i32Type),
        ne: zeroArgs("i32.ne", [0x47], [i32Type, i32Type], i32Type),
        lt_s: zeroArgs("i32.lt_s", [0x48], [i32Type, i32Type], i32Type),
        lt_u: zeroArgs("i32.lt_u", [0x49], [i32Type, i32Type], i32Type),
        gt_s: zeroArgs("i32.gt_s", [0x4A], [i32Type, i32Type], i32Type),
        gt_u: zeroArgs("i32.gt_u", [0x4B], [i32Type, i32Type], i32Type),
        le_s: zeroArgs("i32.le_s", [0x4C], [i32Type, i32Type], i32Type),
        le_u: zeroArgs("i32.le_u", [0x4D], [i32Type, i32Type], i32Type),
        ge_s: zeroArgs("i32.ge_s", [0x4E], [i32Type, i32Type], i32Type),
        ge_u: zeroArgs("i32.ge_u", [0x4F], [i32Type, i32Type], i32Type),

        clz: zeroArgs("i32.clz", [0x67], [i32Type], i32Type),
        ctz: zeroArgs("i32.ctz", [0x68], [i32Type], i32Type),
        popcnt: zeroArgs("i32.popcnt", [0x69], [i32Type], i32Type),
        add: zeroArgs("i32.add", [0x6A], [i32Type, i32Type], i32Type),
        sub: zeroArgs("i32.sub", [0x6B], [i32Type, i32Type], i32Type),
        mul: zeroArgs("i32.mul", [0x6C], [i32Type, i32Type], i32Type),
        div_s: zeroArgs("i32.div_s", [0x6D], [i32Type, i32Type], i32Type),
        div_u: zeroArgs("i32.div_u", [0x6E], [i32Type, i32Type], i32Type),
        rem_s: zeroArgs("i32.rem_s", [0x6F], [i32Type, i32Type], i32Type),
        rem_u: zeroArgs("i32.rem_u", [0x70], [i32Type, i32Type], i32Type),
        and: zeroArgs("i32.and", [0x71], [i32Type, i32Type], i32Type),
        or: zeroArgs("i32.or", [0x72], [i32Type, i32Type], i32Type),
        xor: zeroArgs("i32.xor", [0x73], [i32Type, i32Type], i32Type),
        shl: zeroArgs("i32.shl", [0x74], [i32Type, i32Type], i32Type),
        shr_s: zeroArgs("i32.shr_s", [0x75], [i32Type, i32Type], i32Type),
        shr_u: zeroArgs("i32.shr_u", [0x76], [i32Type, i32Type], i32Type),
        rotl: zeroArgs("i32.rotl", [0x77], [i32Type, i32Type], i32Type),
        rotr: zeroArgs("i32.rotr", [0x78], [i32Type, i32Type], i32Type),

        wrap_i64: zeroArgs("i32.wrap_i64", [0xA7], [i64Type], i32Type),
        trunc_f32_s: zeroArgs("i32.trunc_f32_s", [0xA8], [f32Type], i32Type),
        trunc_f32_u: zeroArgs("i32.trunc_f32_u", [0xA9], [f32Type], i32Type),
        trunc_f64_s: zeroArgs("i32.trunc_f64_s", [0xAA], [f64Type], i32Type),
        trunc_f64_u: zeroArgs("i32.trunc_f64_u", [0xAB], [f64Type], i32Type),

        reinterpret_f32: zeroArgs("i32.reinterpret_f32", [0xBC], [f32Type], i32Type),
        extend8_s: zeroArgs("i32.extend8_s", [0xC0], [i32Type], i32Type),
        extend16_s: zeroArgs("i32.extend16_s", [0xC1], [i32Type], i32Type),

        // Non-trapping Float-to-int Conversions
        trunc_sat_f32_s: zeroArgs("i32.trunc_sat_f32_s", [0xFC, 0], [f32Type], i32Type),
        trunc_sat_f32_u: zeroArgs("i32.trunc_sat_f32_u", [0xFC, 1], [f32Type], i32Type),
        trunc_sat_f64_s: zeroArgs("i32.trunc_sat_f64_s", [0xFC, 2], [f64Type], i32Type),
        trunc_sat_f64_u: zeroArgs("i32.trunc_sat_f64_u", [0xFC, 3], [f64Type], i32Type),
    } as const,

    i64: {
        load: memArg("i64.load", [0x29], "load", i64Type),
        load8_s: memArg("i64.load8_s", [0x30], "load", i64Type),
        load8_u: memArg("i64.load8_u", [0x31], "load", i64Type),
        load16_s: memArg("i64.load16_s", [0x32], "load", i64Type),
        load16_u: memArg("i64.load16_u", [0x33], "load", i64Type),
        load32_s: memArg("i64.load32_s", [0x34], "load", i64Type),
        load32_u: memArg("i64.load32_u", [0x35], "load", i64Type),
        store: memArg("i64.store", [0x37], "store", i64Type),
        store8: memArg("i64.store8", [0x3C], "store", i64Type),
        store16: memArg("i64.store16", [0x3D], "store", i64Type),
        store32: memArg("i64.store32", [0x3E], "store", i64Type),

        const: constantArg<bigint>("i64.const", [0x42], encodeInt64Constant, BigInt, i64Type),

        eqz: zeroArgs("i64.eqz", [0x50], [i64Type], i32Type),
        eq: zeroArgs("i64.eq", [0x51], [i64Type, i64Type], i32Type),
        ne: zeroArgs("i64.ne", [0x52], [i64Type, i64Type], i32Type),
        lt_s: zeroArgs("i64.lt_s", [0x53], [i64Type, i64Type], i32Type),
        lt_u: zeroArgs("i64.lt_u", [0x54], [i64Type, i64Type], i32Type),
        gt_s: zeroArgs("i64.gt_s", [0x55], [i64Type, i64Type], i32Type),
        gt_u: zeroArgs("i64.gt_u", [0x56], [i64Type, i64Type], i32Type),
        le_s: zeroArgs("i64.le_s", [0x57], [i64Type, i64Type], i32Type),
        le_u: zeroArgs("i64.le_u", [0x58], [i64Type, i64Type], i32Type),
        ge_s: zeroArgs("i64.ge_s", [0x59], [i64Type, i64Type], i32Type),
        ge_u: zeroArgs("i64.ge_u", [0x5A], [i64Type, i64Type], i32Type),

        clz: zeroArgs("i64.clz", [0x79], [i64Type], i64Type),
        ctz: zeroArgs("i64.ctz", [0x7A], [i64Type], i64Type),
        popcnt: zeroArgs("i64.popcnt", [0x7B], [i64Type], i64Type),
        add: zeroArgs("i64.add", [0x7C], [i64Type, i64Type], i64Type),
        sub: zeroArgs("i64.sub", [0x7D], [i64Type, i64Type], i64Type),
        mul: zeroArgs("i64.mul", [0x7E], [i64Type, i64Type], i64Type),
        div_s: zeroArgs("i64.div_s", [0x7F], [i64Type, i64Type], i64Type),
        div_u: zeroArgs("i64.div_u", [0x80], [i64Type, i64Type], i64Type),
        rem_s: zeroArgs("i64.rem_s", [0x81], [i64Type, i64Type], i64Type),
        rem_u: zeroArgs("i64.rem_u", [0x82], [i64Type, i64Type], i64Type),
        and: zeroArgs("i64.and", [0x83], [i64Type, i64Type], i64Type),
        or: zeroArgs("i64.or", [0x84], [i64Type, i64Type], i64Type),
        xor: zeroArgs("i64.xor", [0x85], [i64Type, i64Type], i64Type),
        shl: zeroArgs("i64.shl", [0x86], [i64Type, i64Type], i64Type),
        shr_s: zeroArgs("i64.shr_s", [0x87], [i64Type, i64Type], i64Type),
        shr_u: zeroArgs("i64.shr_u", [0x88], [i64Type, i64Type], i64Type),
        rotl: zeroArgs("i64.rotl", [0x89], [i64Type, i64Type], i64Type),
        rotr: zeroArgs("i64.rotr", [0x8A], [i64Type, i64Type], i64Type),

        extend_i32_s: zeroArgs("i64.extend_i32_s", [0xAC], [i32Type], i64Type),
        extend_i32_u: zeroArgs("i64.extend_i32_u", [0xAD], [i32Type], i64Type),
        trunc_f32_s: zeroArgs("i64.trunc_f32_s", [0xAE], [f32Type], i64Type),
        trunc_f32_u: zeroArgs("i64.trunc_f32_u", [0xAF], [f32Type], i64Type),
        trunc_f64_s: zeroArgs("i64.trunc_f64_s", [0xB0], [f64Type], i64Type),
        trunc_f64_u: zeroArgs("i64.trunc_f64_u", [0xB1], [f64Type], i64Type),

        reinterpret_f64: zeroArgs("i64.reinterpret_f64", [0xBD], [f64Type], i64Type),
        extend8_s: zeroArgs("i64.extend8_s", [0xC2], [i64Type], i64Type),
        extend16_s: zeroArgs("i64.extend16_s", [0xC3], [i64Type], i64Type),
        extend32_s: zeroArgs("i64.extend32_s", [0xC4], [i64Type], i64Type),

        // Non-trapping Float-to-int Conversions
        trunc_sat_f32_s: zeroArgs("i32.trunc_sat_f32_s", [0xFC, 4], [f32Type], i64Type),
        trunc_sat_f32_u: zeroArgs("i32.trunc_sat_f32_u", [0xFC, 5], [f32Type], i64Type),
        trunc_sat_f64_s: zeroArgs("i32.trunc_sat_f64_s", [0xFC, 6], [f64Type], i64Type),
        trunc_sat_f64_u: zeroArgs("i32.trunc_sat_f64_u", [0xFC, 7], [f64Type], i64Type),
    } as const,

    f32: {
        load: memArg("f32.load", [0x2A], "load", f32Type),
        store: memArg("f32.store", [0x38], "store", f32Type),

        const: constantArg<number>("f32.const", [0x43], encodeF32, Number, f32Type),

        eq: zeroArgs("f32.eq", [0x5B], [f32Type, f32Type], i32Type),
        ne: zeroArgs("f32.ne", [0x5C], [f32Type, f32Type], i32Type),
        lt: zeroArgs("f32.lt", [0x5D], [f32Type, f32Type], i32Type),
        gt: zeroArgs("f32.gt", [0x5E], [f32Type, f32Type], i32Type),
        le: zeroArgs("f32.le", [0x5F], [f32Type, f32Type], i32Type),
        ge: zeroArgs("f32.ge", [0x60], [f32Type, f32Type], i32Type),

        abs: zeroArgs("f32.abs", [0x8B], [f32Type], f32Type),
        neg: zeroArgs("f32.neg", [0x8C], [f32Type], f32Type),
        ceil: zeroArgs("f32.ceil", [0x8D], [f32Type], f32Type),
        floor: zeroArgs("f32.floor", [0x8E], [f32Type], f32Type),
        trunc: zeroArgs("f32.trunc", [0x8F], [f32Type], f32Type),
        nearest: zeroArgs("f32.nearest", [0x90], [f32Type], f32Type),
        sqrt: zeroArgs("f32.sqrt", [0x91], [f32Type], f32Type),
        add: zeroArgs("f32.add", [0x92], [f32Type, f32Type], f32Type),
        sub: zeroArgs("f32.sub", [0x93], [f32Type, f32Type], f32Type),
        mul: zeroArgs("f32.mul", [0x94], [f32Type, f32Type], f32Type),
        div: zeroArgs("f32.div", [0x95], [f32Type, f32Type], f32Type),
        min: zeroArgs("f32.min", [0x96], [f32Type, f32Type], f32Type),
        max: zeroArgs("f32.max", [0x97], [f32Type, f32Type], f32Type),
        copysign: zeroArgs("f32.copysign", [0x98], [f32Type, f32Type], f32Type),

        convert_i32_s: zeroArgs("f32.convert_i32_s", [0xB2], [i32Type], f32Type),
        convert_i32_u: zeroArgs("f32.convert_i32_u", [0xB3], [i32Type], f32Type),
        convert_i64_s: zeroArgs("f32.convert_i64_s", [0xB4], [i64Type], f32Type),
        convert_i64_u: zeroArgs("f32.convert_i64_u", [0xB5], [i64Type], f32Type),
        demote_f64: zeroArgs("f32.demote_f64", [0xB6], [f64Type], f32Type),

        reinterpret_i32: zeroArgs("f32.reinterpret_i32", [0xBE], [i32Type], f32Type),
    } as const,

    f64: {
        load: memArg("f64.load", [0x2B], "load", f64Type),
        store: memArg("f64.store", [0x39], "store", f64Type),

        const: constantArg<number>("f64.const", [0x44], encodeF64, Number, f64Type),

        eq: zeroArgs("f64.eq", [0x61], [f64Type, f64Type], i32Type),
        ne: zeroArgs("f64.ne", [0x62], [f64Type, f64Type], i32Type),
        lt: zeroArgs("f64.lt", [0x63], [f64Type, f64Type], i32Type),
        gt: zeroArgs("f64.gt", [0x64], [f64Type, f64Type], i32Type),
        le: zeroArgs("f64.le", [0x65], [f64Type, f64Type], i32Type),
        ge: zeroArgs("f64.ge", [0x66], [f64Type, f64Type], i32Type),

        abs: zeroArgs("f64.abs", [0x99], [f64Type], f64Type),
        neg: zeroArgs("f64.neg", [0x9A], [f64Type], f64Type),
        ceil: zeroArgs("f64.ceil", [0x9B], [f64Type], f64Type),
        floor: zeroArgs("f64.floor", [0x9C], [f64Type], f64Type),
        trunc: zeroArgs("f64.trunc", [0x9D], [f64Type], f64Type),
        nearest: zeroArgs("f64.nearest", [0x9E], [f64Type], f64Type),
        sqrt: zeroArgs("f64.sqrt", [0x9F], [f64Type], f64Type),
        add: zeroArgs("f64.add", [0xA0], [f64Type, f64Type], f64Type),
        sub: zeroArgs("f64.sub", [0xA1], [f64Type, f64Type], f64Type),
        mul: zeroArgs("f64.mul", [0xA2], [f64Type, f64Type], f64Type),
        div: zeroArgs("f64.div", [0xA3], [f64Type, f64Type], f64Type),
        min: zeroArgs("f64.min", [0xA4], [f64Type, f64Type], f64Type),
        max: zeroArgs("f64.max", [0xA5], [f64Type, f64Type], f64Type),
        copysign: zeroArgs("f64.copysign", [0xA6], [f64Type, f64Type], f64Type),

        convert_i32_s: zeroArgs("f64.convert_i32_s", [0xB7], [i32Type], f64Type),
        convert_i32_u: zeroArgs("f64.convert_i32_u", [0xB8], [i32Type], f64Type),
        convert_i64_s: zeroArgs("f64.convert_i64_s", [0xB9], [i64Type], f64Type),
        convert_i64_u: zeroArgs("f64.convert_i64_u", [0xBA], [i64Type], f64Type),
        promote_f32: zeroArgs("f64.promote_f32", [0xBB], [f32Type], f64Type),

        reinterpret_i64: zeroArgs("f64.reinterpret_i64", [0xBF], [i64Type], f64Type),
    } as const

} as const;
