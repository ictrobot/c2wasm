import {WExpression, Instructions} from "../wasm";
import {WLocal} from "../wasm/functions";
import {deadCodeElimination} from "./dead_code";
import {getFlags} from "./flags";
import {realloc_locals, remapLocals} from "./flow/local_allocation";
import {pre} from "./flow/pre";
import {copyPropagation} from "./flow/reaching_defs";
import {Optimizer} from "./optimizer";
import {peepholeMulti, peepholeOptimizers} from "./peephole";

const optimizers: Optimizer[] = [];

export function optimize(expr: WExpression): void {
    const flags = getFlags();
    for (const optimizer of optimizers) {
        if (optimizer.enabled(flags)) optimizer.run(expr);
    }
}

function peepholeOptimizations(expr: WExpression) {
    const flags = getFlags();
    peepholeMulti(expr, peepholeOptimizers.filter(x => x.enabled(flags)).map(x => [x.run, x.peepholeSize]));
}

optimizers.push({
    name: "Peephole optimizations",
    enabled: () => true,
    run: peepholeOptimizations
});

optimizers.push({
    name: "Partial redundancy elimination",
    enabled: (flags) => flags.partial_redundancy_elimination,
    run: pre
});

optimizers.push({
    name: "Copy propagation",
    enabled: (flags) => flags.copy_propagation,
    run: copyPropagation
});

optimizers.push({
    name: "Basic dead code elimination",
    enabled: (flags) => flags.dead_code_elimination,
    run: deadCodeElimination
});

optimizers.push({
    name: "Reallocate locals",
    enabled: (flags) => flags.reallocate_locals,
    run: realloc_locals
});

optimizers.push({
    name: "Remove unused locals",
    enabled: (flags) => flags.unused_locals,
    run: (expr) => {
        const usedLocals = new Set<WLocal>();
        for (const resource of [...expr.writes, ...expr.reads]) {
            if (resource instanceof WLocal && !resource.isArgument) usedLocals.add(resource);
        }
        if (usedLocals.size === expr.builder.locals.length) return;

        // store current list of locals to enable lookup when re-encoding
        const oldLocals = expr.builder.args.slice();
        oldLocals.push(...expr.builder.locals);

        // remove any unused locals from builder
        for (const local of expr.builder.locals.slice()) { // slice needed to avoid modifying whilst iterating
            if (!usedLocals.has(local)) {
                expr.builder.deleteLocal(local);
            }
        }

        // now have to re-encode any local instructions
        remapLocals(expr, oldLocals);
    }
});

optimizers.push({
    name: "Peephole optimizations 2nd pass",
    enabled: (flags) => flags.peephole_2nd_pass,
    run: peepholeOptimizations
});

optimizers.push({
    name: "return",
    enabled: () => true,
    run: (expr) => {
        if (expr.builder.type[1].length > 0) {
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
