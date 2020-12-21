import {WFunctionBuilder, WExpression, Instructions, f32Type, f64Type, i32Type} from "../wasm";
import {WLocal} from "../wasm/functions";
import {Optimizer, peephole} from "./optimizer";

const optimizers: Optimizer[] = [];

export function optimize(fn: WFunctionBuilder, expr: WExpression): void {
    optimizers.forEach(opt => opt.run(fn, expr));
}

optimizers.push({
    name: "return",
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

function emulateOverflow(bits: number, value: bigint) {
    const bitmask = 2n ** BigInt(bits) - 1n;
    return value & bitmask;
}
