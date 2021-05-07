import {Instructions, f32Type, f64Type, i32Type, WExpression, i64Type} from "../wasm";
import {labelidx} from "../wasm/base_types";
import {WLocal} from "../wasm/functions";
import {InstrInstance, PartialInstr} from "../wasm/instr_helpers";
import {OptimisationFlags} from "./flags";

type PeepholeCallback = (instr: InstrInstance[], depth: number) => (InstrInstance | PartialInstr)[] | undefined;
interface PeepholeOptimiser {
    name: string,
    enabled: (flags: OptimisationFlags) => boolean,
    run: PeepholeCallback,
    peepholeSize: number
}

export const peepholeOptimisers: PeepholeOptimiser[] = [];

export function peephole(expr: WExpression, fn: PeepholeCallback, size: number, depth = 0): void {
    for (let i = 0; i <= expr.instructions.length - size; i++) {
        const replacement = fn(expr.instructions.slice(i, i + size), depth);
        if (replacement !== undefined) expr.replace(i, i + size, ...replacement);
    }

    for (const instruction of expr.instructions) {
        if (instruction.type === "structured") {
            peephole(instruction.immediate.expression, fn, size, depth + 1);
            if (instruction.immediate.expression2) peephole(instruction.immediate.expression2, fn, size, depth + 1);
        }
    }
}

export function peepholeMulti(expr: WExpression, fns: [fn: PeepholeCallback, size: number][], depth = 0): void {
    const maxSize = fns.map(x => x[1]).reduce((a, b) => Math.max(a, b), 1);

    // optimise inside structured instructions first in case this eliminates branches etc which enable
    // more optimisations to occur at this level
    for (const instruction of expr.instructions) {
        if (instruction.type === "structured") {
            peepholeMulti(instruction.immediate.expression, fns, depth + 1);
            if (instruction.immediate.expression2) peepholeMulti(instruction.immediate.expression2, fns, depth + 1);
        }
    }

    for (let i = 0; i < expr.instructions.length; i++) {
        for (const [fn, size] of fns) {
            if (i + size > expr.instructions.length) continue;

            const replacement = fn(expr.instructions.slice(i, i + size), depth);
            if (replacement !== undefined) {
                expr.replace(i, i + size, ...replacement);

                i -= maxSize; // repeat optimisers with new instructions
                if (i < -1) i = -1;
                break;
            }
        }
    }
}

peepholeOptimisers.push({
    name: "[local.set, local.get] => [local.tee]",
    enabled: (flags) => flags.peephole_local_tee,
    run: ([instr1, instr2]) => {
        if (instr1.name === "local.set" && instr2.name === "local.get") {
            const resource = instr1.writes[0];
            if (!(resource instanceof WLocal) || instr2.reads[0] !== resource) return;
            return [Instructions.local.tee(resource)];
        } else if (instr1.name === "local.tee" && instr2.name === "drop") {
            // convert back to a single local.set if the result is now discarded
            const resource = instr1.writes[0];
            if (!(resource instanceof WLocal)) return;
            return [Instructions.local.set(resource)];
        }
    },
    peepholeSize: 2
});

peepholeOptimisers.push({
    name: "?.const 0, ?.add",
    enabled: (flags) => flags.peephole_add_0,
    run: ([instr1, instr2]) => {
        // eslint-disable-next-line eqeqeq
        if (instr1.type !== "constant" || instr1.immediate.value != 0) return;
        if (instr2.name.endsWith(".add")) return [];
    },
    peepholeSize: 2
});

peepholeOptimisers.push({
    name: "i32.const, i32.const, i32.[op]",
    enabled: (flags) => flags.peephole_i32_constants_ops,
    run: ([instr1, instr2, instr3]) => {
        if (instr1.type !== "constant" || instr2.type !== "constant" || !instr3.name.startsWith("i32.")) return;
        if (instr1.result !== i32Type || instr2.result !== i32Type) return;

        const s1 = Number(instr1.immediate.value), s2 = Number(instr2.immediate.value);
        const u1 = (BigInt(s1) + 2n ** 32n) % (2n ** 32n), u2 = (BigInt(s2) + 2n ** 32n) % (2n ** 32n);

        switch (instr3.name) {
        case "i32.eq":
            return [Instructions.i32.const(s1 === s2 ? 1 : 0)];
        case "i32.ne":
            return [Instructions.i32.const(s1 !== s2 ? 1 : 0)];
        case "i32.lt_s":
            return [Instructions.i32.const(s1 < s2 ? 1 : 0)];
        case "i32.lt_u":
            return [Instructions.i32.const(u1 < u2 ? 1 : 0)];
        case "i32.gt_s":
            return [Instructions.i32.const(s1 > s2 ? 1 : 0)];
        case "i32.gt_u":
            return [Instructions.i32.const(u1 > u2 ? 1 : 0)];
        case "i32.le_s":
            return [Instructions.i32.const(s1 <= s2 ? 1 : 0)];
        case "i32.le_u":
            return [Instructions.i32.const(u1 <= u2 ? 1 : 0)];
        case "i32.ge_s":
            return [Instructions.i32.const(s1 >= s2 ? 1 : 0)];
        case "i32.ge_u":
            return [Instructions.i32.const(u1 >= u2 ? 1 : 0)];
        case "i32.add":
            return [Instructions.i32.const((s1 + s2) | 0)];
        case "i32.sub":
            return [Instructions.i32.const((s1 - s2) | 0)];
        case "i32.mul":
            return [Instructions.i32.const((u1 * u2) & (2n ** 32n - 1n))];
        case "i32.div_s":
            if (s2 === 0) return;
            return [Instructions.i32.const((s1 / s2) | 0)];
        case "i32.div_u":
            if (s2 === 0) return;
            return [Instructions.i32.const(u1 / u2)];
        case "i32.rem_s":
            if (s2 === 0) return;
            return [Instructions.i32.const(s1 % s2)];
        case "i32.rem_u":
            if (s2 === 0) return;
            return [Instructions.i32.const(u1 % u2)];
        case "i32.and":
            return [Instructions.i32.const(s1 & s2)];
        case "i32.or":
            return [Instructions.i32.const(s1 | s2)];
        case "i32.xor":
            return [Instructions.i32.const(s1 ^ s2)];
        case "i32.shl":
            return [Instructions.i32.const(s1 << s2)];
        case "i32.shr_s":
            return [Instructions.i32.const(s1 >> s2)];
        case "i32.shr_u":
            return [Instructions.i32.const(s1 >>> s2)];
        }
    },
    peepholeSize: 3
});

peepholeOptimisers.push({
    name: "i32.const, i32.eqz",
    enabled: (flags) => flags.peephole_i32_constants_ops,
    run: ([instr1, instr2]) => {
        if (instr1.type !== "constant" || !instr2.name.endsWith(".eqz")) return;
        // eslint-disable-next-line eqeqeq
        return [Instructions.i32.const(instr1.immediate.value == 0 ? 1 : 0)];
    },
    peepholeSize: 2
});

peepholeOptimisers.push({
    name: "?.const, ?.const, ?.add/mul",
    enabled: (flags) => flags.peephole_constants_add_mul,
    run: ([instr1, instr2, instr3]) => {
        // eslint-disable-next-line eqeqeq
        if (instr1.type !== "constant" || instr2.type !== "constant") return;

        let value;
        if (instr3.name.endsWith(".add")) {
            if (instr1.result === f32Type) {
                return [Instructions.f32.const(Number(instr1.immediate.value) + Number(instr2.immediate.value))];
            } else if (instr1.result === f64Type) {
                return [Instructions.f64.const(Number(instr1.immediate.value) + Number(instr2.immediate.value))];
            }

            value = BigInt(instr1.immediate.value) + BigInt(instr2.immediate.value);
        } else if (instr3.name.endsWith(".mul")) {
            if (instr1.result === f32Type) {
                return [Instructions.f32.const(Number(instr1.immediate.value) * Number(instr2.immediate.value))];
            } else if (instr1.result === f64Type) {
                return [Instructions.f64.const(Number(instr1.immediate.value) * Number(instr2.immediate.value))];
            }

            value = BigInt(instr1.immediate.value) * BigInt(instr2.immediate.value);
        } else {
            return;
        }

        if (instr1.result === i32Type) {
            return [Instructions.i32.const(emulateInt(32n, value))];
        } else {
            return [Instructions.i64.const(emulateInt(64n, value))];
        }
    },
    peepholeSize: 3
});

peepholeOptimisers.push({
    name: "i32.const, i32.add, i32.const, i32.add",
    enabled: (flags) => flags.peephole_combine_adds,
    run: ([instr1, instr2, instr3, instr4]) => {
        // eslint-disable-next-line eqeqeq
        if (instr1.type !== "constant" || instr3.type !== "constant") return;
        if (instr2.name !== "i32.add" || instr4.name !== "i32.add") return;
        return [
            Instructions.i32.const(emulateInt(32n, BigInt(instr1.immediate.value) + BigInt(instr3.immediate.value))),
            Instructions.i32.add()
        ];
    },
    peepholeSize: 4
});

peepholeOptimisers.push({
    name: "..., i32.const, i32.add, *.load offset",
    enabled: (flags) => flags.peephole_load_offset,
    run: ([instr1, instr2, instr3]) => {
        if (instr1.type !== "constant" || instr1.result !== i32Type) return;
        if (instr2.name !== "i32.add") return;
        if (instr3.type !== "memory" || !instr3.name.includes(".load")) return;

        const offset = instr3.immediate.offset + BigInt(instr1.immediate.value);
        if (offset > 127) return; // only inline small offsets

        if (instr3.result === i32Type) {
            if (instr3.name === "i32.load") return [Instructions.i32.load(instr3.immediate.align, offset)];
            if (instr3.name === "i32.load8_s") return [Instructions.i32.load8_s(instr3.immediate.align, offset)];
            if (instr3.name === "i32.load8_u") return [Instructions.i32.load8_u(instr3.immediate.align, offset)];
            if (instr3.name === "i32.load16_s") return [Instructions.i32.load16_s(instr3.immediate.align, offset)];
            if (instr3.name === "i32.load16_u") return [Instructions.i32.load16_u(instr3.immediate.align, offset)];
        } else if (instr3.result === i64Type) {
            if (instr3.name === "i64.load") return [Instructions.i64.load(instr3.immediate.align, offset)];
            if (instr3.name === "i64.load8_s") return [Instructions.i64.load8_s(instr3.immediate.align, offset)];
            if (instr3.name === "i64.load16_s") return [Instructions.i64.load16_s(instr3.immediate.align, offset)];
            if (instr3.name === "i64.load16_u") return [Instructions.i64.load16_u(instr3.immediate.align, offset)];
            if (instr3.name === "i64.load32_s") return [Instructions.i64.load32_s(instr3.immediate.align, offset)];
            if (instr3.name === "i64.load32_u") return [Instructions.i64.load32_u(instr3.immediate.align, offset)];
        } else if (instr3.result === f32Type) {
            return [Instructions.f32.load(instr3.immediate.align, offset)];
        } else if (instr3.result === f64Type) {
            return [Instructions.f64.load(instr3.immediate.align, offset)];
        }
    },
    peepholeSize: 3
});

peepholeOptimisers.push({
    name: "remove unused blocks and loops",
    enabled: (flags) => flags.peephole_unused_blocks,
    run: ([instr]) => {
        if (instr.type !== "structured" || instr.name === "if") return;
        if (branchedTo(instr)) return;

        return eliminateStructuredInstruction(instr.immediate.expression);
    },
    peepholeSize: 1
});

peepholeOptimisers.push({
    name: "remove constant ifs",
    enabled: (flags) => flags.peephole_constant_if,
    run: ([instr1, instr2]) => {
        if (instr1.type !== "constant" || instr1.result !== i32Type) return;
        if (instr2.type !== "structured" || instr2.name !== "if") return;

        let body;
        // eslint-disable-next-line eqeqeq
        if (instr1.immediate.value != 0) {
            // if statement always true
            body = instr2.immediate.expression;
        } else if (instr2.immediate.expression2) {
            // if statement always false and else clause present
            body = instr2.immediate.expression2;
        } else {
            // always false and no else clause
            return [];
        }

        // replace constant if with a block with the body of the corresponding clause which is needed encase the
        // if statement was branched too, otherwise `peephole_unused_blocks` will remove it
        return [Instructions.block(instr2.immediate.type, body.instructions.slice())];
    },
    peepholeSize: 2
});

function emulateInt(bits: bigint, value: bigint) {
    const bitmask = (2n ** bits) - 1n;
    return value & bitmask;
}

function branchedTo(instr: InstrInstance, depth = -1n): boolean {
    if (instr.type === "index" && instr.name.startsWith("br")) {
        return instr.immediate.value === depth;
    }
    if (instr.type === "table" && instr.name === "br_table") {
        return instr.immediate.defaultValue === depth || instr.immediate.valueTable.some(x => x === depth);
    }
    if (instr.type !== "structured") return false;

    const {expression, expression2} = instr.immediate;
    if (expression.instructions.some(child => branchedTo(child, depth + 1n))) return true;
    if (expression2 === undefined) return false;
    return expression2.instructions.some(child => branchedTo(child, depth + 1n));
}

export function eliminateStructuredInstruction(expr: WExpression): InstrInstance[] {
    // decrement the values of branch instructions which branch outside
    peephole(expr, ([child], depth) => {
        if (child.type === "index") {
            if (child.immediate.value < depth) return;

            if (child.name === "br") {
                return [Instructions.br(child.immediate.value - 1n as labelidx)];
            } else if (child.name === "br_if") {
                return [Instructions.br_if(child.immediate.value - 1n as labelidx)];
            }
        } else if (child.type === "table" && child.name === "br_table") {
            const {defaultValue, valueTable} = child.immediate;
            return [Instructions.br_table(
                (defaultValue < depth ? defaultValue : defaultValue - 1n) as labelidx,
                valueTable.map(v => (v < depth ? v : v - 1n) as labelidx)
            )];
        }
    }, 1);

    return expr.instructions.slice();
}
