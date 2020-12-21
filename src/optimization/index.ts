import {WFunctionBuilder, WExpression, Instructions} from "../wasm";
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
