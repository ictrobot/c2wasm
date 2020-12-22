import {WFunctionBuilder, WExpression, Instructions, f32Type, f64Type, i32Type} from "../wasm";
import {labelidx} from "../wasm/base_types";
import {WLocal} from "../wasm/functions";
import {InstrInstance} from "../wasm/instr_helpers";
import {getFlags} from "./flags";
import {Optimizer, peephole} from "./optimizer";

const optimizers: Optimizer[] = [];

export function optimize(fn: WFunctionBuilder, expr: WExpression): void {
    const flags = getFlags();
    for (const optimizer of optimizers) {
        if (optimizer.enabled(flags)) optimizer.run(fn, expr);
    }
}

optimizers.push({
    name: "return",
    enabled: () => true,
    run: (fn, expr) => {
        if (fn.type[1].length > 0) {
            // if function returns something
            if (expr.get(-1).name === "return") {
                // final return can be implicit
                expr.pop();
            } else if (expr.stack.length === 0) {
                // no return at end of function or value left on stack, must return elsewhere
                expr.push(Instructions.unreachable());
            }
        }
    }}
);

optimizers.push({
    name: "[local.set, local.get] => [local.tee]",
    enabled: (flags) => flags.peephole_local_tee,
    run: (fn, expr) => {
        peephole(expr, ([instr1, instr2]) => {
            if (instr1.name !== "local.set" || instr2.name !== "local.get") return;
            const resource = instr1.writes[0];
            if (!(resource instanceof WLocal) || instr2.reads[0] !== resource) return;
            return [Instructions.local.tee(resource)];
        }, 2);
    }
});

optimizers.push({
    name: "?.const, ?.const, ?.mul",
    enabled: (flags) => flags.peephole_mul,
    run: (fn, expr) => {
        peephole(expr, ([instr1, instr2, instr3]) => {
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
        }, 3);
    }
});


optimizers.push({
    name: "?.const 0, ?.add",
    enabled: (flags) => flags.peephole_add_0,
    run: (fn, expr) => {
        peephole(expr, ([instr1, instr2]) => {
            // eslint-disable-next-line eqeqeq
            if (instr1.type !== "constant" || instr1.args.value != 0) return;
            if (instr2.name.endsWith(".add")) return [];
        }, 2);
    }
});


optimizers.push({
    name: "i32.const, i32.add, i32.const, i32.add",
    enabled: (flags) => flags.peephole_combine_adds,
    run: (fn, expr) => {
        peephole(expr, ([instr1, instr2, instr3, instr4]) => {
            // eslint-disable-next-line eqeqeq
            if (instr1.type !== "constant" || instr3.type !== "constant") return;
            if (instr2.name !== "i32.add" || instr4.name !== "i32.add") return;
            return [
                Instructions.i32.const(emulateOverflow(32, BigInt(instr1.args.value) + BigInt(instr3.args.value))),
                Instructions.i32.add()
            ];
        }, 4);
    }
});

optimizers.push({
    name: "remove unused blocks and loops",
    enabled: (flags) => flags.peephole_remove_blocks,
    run: (fn, expr) => {
        peephole(expr, ([instr]) => {
            if (instr.type !== "structured" || instr.name === "if" || instr.args.type !== null) return;
            if (branchedTo(instr)) return;

            // we can remove the block/loop as nothing branches to it
            const replacement = instr.args.expression;
            // however we must decrement the values of branch instructions inside the block which branch outside
            peephole(replacement, ([child], depth) => {
                if (child.type !== "index" || child.args.value < depth) return;

                if (child.name === "br") {
                    return [Instructions.br(child.args.value - 1n as labelidx)];
                } else if (child.name === "br_if") {
                    return [Instructions.br_if(child.args.value - 1n as labelidx)];
                }
            }, 1);

            return replacement.instructions.slice();
        }, 1);
    }
});

function branchedTo(instr: InstrInstance, depth = -1n): boolean {
    if (instr.type === "index" && instr.name.startsWith("br")) {
        return instr.args.value === depth;
    }
    if (instr.type !== "structured") return false;

    const {expression, expression2} = instr.args;
    if (expression.instructions.some(child => branchedTo(child, depth + 1n))) return true;
    if (expression2 === undefined) return false;
    return expression2.instructions.some(child => branchedTo(child, depth + 1n));
}

function emulateOverflow(bits: number, value: bigint) {
    const bitmask = 2n ** BigInt(bits) - 1n;
    return value & bitmask;
}
