import {Instructions, f32Type, f64Type, i32Type, WExpression} from "../wasm";
import {WLocal} from "../wasm/functions";
import {InstrInstance, PartialInstr} from "../wasm/instr_helpers";
import {OptimizationFlags} from "./flags";

type PeepholeCallback = (instr: InstrInstance[], depth: number) => (InstrInstance | PartialInstr)[] | undefined;
interface PeepholeOptimizer {
    name: string,
    enabled: (flags: OptimizationFlags) => boolean,
    run: PeepholeCallback,
    peepholeSize: number
}

export const peepholeOptimizers: PeepholeOptimizer[] = [];

export function peephole(expr: WExpression, fn: PeepholeCallback, size: number, depth = 0): void {
    for (let i = 0; i <= expr.instructions.length - size; i++) {
        const replacement = fn(expr.instructions.slice(i, i + size), depth);
        if (replacement !== undefined) expr.replace(i, i + size, ...replacement);
    }

    for (const instruction of expr.instructions) {
        if (instruction.type === "structured") {
            peephole(instruction.args.expression, fn, size, depth + 1);
            if (instruction.args.expression2) peephole(instruction.args.expression2, fn, size, depth + 1);
        }
    }
}

export function peepholeMulti(expr: WExpression, fns: [fn: PeepholeCallback, size: number][], depth = 0): void {
    for (let i = 0; i < expr.instructions.length; i++) {
        for (const [fn, size] of fns) {
            if (i + size > expr.instructions.length) continue;

            const replacement = fn(expr.instructions.slice(i, i + size), depth);
            if (replacement !== undefined) {
                expr.replace(i, i + size, ...replacement);
                i--; // repeat same index again with new instructions
                break;
            }
        }
    }

    for (const instruction of expr.instructions) {
        if (instruction.type === "structured") {
            peepholeMulti(instruction.args.expression, fns, depth + 1);
            if (instruction.args.expression2) peepholeMulti(instruction.args.expression2, fns, depth + 1);
        }
    }
}

peepholeOptimizers.push({
    name: "[local.set, local.get] => [local.tee]",
    enabled: (flags) => flags.peephole_local_tee,
    run: ([instr1, instr2]) => {
        if (instr1.name !== "local.set" || instr2.name !== "local.get") return;
        const resource = instr1.writes[0];
        if (!(resource instanceof WLocal) || instr2.reads[0] !== resource) return;
        return [Instructions.local.tee(resource)];
    },
    peepholeSize: 2
});

// TODO support ?.add and ?.sub
peepholeOptimizers.push({
    name: "?.const, ?.const, ?.mul",
    enabled: (flags) => flags.peephole_mul,
    run: ([instr1, instr2, instr3]) => {
        // eslint-disable-next-line eqeqeq
        if (instr1.type !== "constant" || instr2.type !== "constant") return;
        if (!instr3.name.endsWith(".mul")) return;
        if (instr1.result === f32Type) {
            return [Instructions.f32.const(Number(instr1.args.value) * Number(instr2.args.value))];
        } else if (instr1.result === f64Type) {
            return [Instructions.f64.const(Number(instr1.args.value) * Number(instr2.args.value))];
        }

        const value = BigInt(instr1.args.value) * BigInt(instr2.args.value);
        if (instr1.result === i32Type) {
            return [Instructions.i32.const(emulateOverflow(32, value))];
        } else {
            return [Instructions.i64.const(emulateOverflow(64, value))];
        }
    },
    peepholeSize: 3
});


peepholeOptimizers.push({
    name: "?.const 0, ?.add",
    enabled: (flags) => flags.peephole_add_0,
    run: ([instr1, instr2]) => {
        // eslint-disable-next-line eqeqeq
        if (instr1.type !== "constant" || instr1.args.value != 0) return;
        if (instr2.name.endsWith(".add")) return [];
    },
    peepholeSize: 2
});


peepholeOptimizers.push({
    name: "i32.const, i32.add, i32.const, i32.add",
    enabled: (flags) => flags.peephole_combine_adds,
    run: ([instr1, instr2, instr3, instr4]) => {
        // eslint-disable-next-line eqeqeq
        if (instr1.type !== "constant" || instr3.type !== "constant") return;
        if (instr2.name !== "i32.add" || instr4.name !== "i32.add") return;
        return [
            Instructions.i32.const(emulateOverflow(32, BigInt(instr1.args.value) + BigInt(instr3.args.value))),
            Instructions.i32.add()
        ];
    },
    peepholeSize: 4
});

function emulateOverflow(bits: number, value: bigint) {
    const bitmask = 2n ** BigInt(bits) - 1n;
    return value & bitmask;
}
