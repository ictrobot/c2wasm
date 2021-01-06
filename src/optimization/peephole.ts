import {Instructions, f32Type, f64Type, i32Type, WExpression} from "../wasm";
import {labelidx} from "../wasm/base_types";
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
            peephole(instruction.immediate.expression, fn, size, depth + 1);
            if (instruction.immediate.expression2) peephole(instruction.immediate.expression2, fn, size, depth + 1);
        }
    }
}

export function peepholeMulti(expr: WExpression, fns: [fn: PeepholeCallback, size: number][], depth = 0): void {
    const maxSize = fns.map(x => x[1]).reduce((a, b) => Math.min(a, b), 1);

    for (let i = 0; i < expr.instructions.length; i++) {
        for (const [fn, size] of fns) {
            if (i + size > expr.instructions.length) continue;

            const replacement = fn(expr.instructions.slice(i, i + size), depth);
            if (replacement !== undefined) {
                expr.replace(i, i + size, ...replacement);

                i -= maxSize; // repeat optimizers with new instructions
                if (i < -1) i = -1;
                break;
            }
        }
    }

    for (const instruction of expr.instructions) {
        if (instruction.type === "structured") {
            peepholeMulti(instruction.immediate.expression, fns, depth + 1);
            if (instruction.immediate.expression2) peepholeMulti(instruction.immediate.expression2, fns, depth + 1);
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

peepholeOptimizers.push({
    name: "?.const 0, ?.add",
    enabled: (flags) => flags.peephole_add_0,
    run: ([instr1, instr2]) => {
        // eslint-disable-next-line eqeqeq
        if (instr1.type !== "constant" || instr1.immediate.value != 0) return;
        if (instr2.name.endsWith(".add")) return [];
    },
    peepholeSize: 2
});

peepholeOptimizers.push({
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

peepholeOptimizers.push({
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

peepholeOptimizers.push({
    name: "remove unused blocks and loops",
    enabled: (flags) => flags.peephole_unused_blocks,
    run: ([instr]) => {
        if (instr.type !== "structured" || instr.name === "if" || instr.immediate.type !== null) return;
        if (branchedTo(instr)) return;

        return eliminateStructuredInstruction(instr.immediate.expression);
    },
    peepholeSize: 1
});

peepholeOptimizers.push({
    name: "remove constant ifs",
    enabled: (flags) => flags.peephole_constant_if,
    run: ([instr1, instr2]) => {
        if (instr1.type !== "constant" || instr1.result !== i32Type) return;
        if (instr2.type !== "structured" || instr2.name !== "if") return;

        // eslint-disable-next-line eqeqeq
        if (instr1.immediate.value != 0) {
            return eliminateStructuredInstruction(instr2.immediate.expression);
        } else {
            if (instr2.immediate.expression2) return eliminateStructuredInstruction(instr2.immediate.expression2);
            return [];
        }
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
