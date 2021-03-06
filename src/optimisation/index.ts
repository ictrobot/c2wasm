import {WExpression, Instructions, WFunction} from "../wasm";
import {WLocal} from "../wasm/functions";
import {deadCodeElimination} from "./dead_code";
import {getFlags} from "./flags";
import {realloc_locals, remapLocals} from "./flow/local_allocation";
import {pre} from "./flow/pre";
import {rangeSplitting} from "./flow/range_splitting";
import {copyPropagation} from "./flow/reaching_defs";
import {Optimiser} from "./optimiser";
import {peepholeMulti, peepholeOptimisers} from "./peephole";

const optimisers: Optimiser[] = [];

export function optimise(fn: WFunction): void {
    const flags = getFlags(), expr = fn.body;

    fn.instrCounts.push({name: "before opt", count: countInstructions(expr)});
    for (const optimiser of optimisers) {
        if (optimiser.enabled(flags)) {
            optimiser.run(expr);
            fn.instrCounts.push({name: optimiser.name, count: countInstructions(expr)});
        }
    }
}

function countInstructions(expr: WExpression): number {
    let num = expr.instructions.length;
    for (const instr of expr.instructions) {
        if (instr.type === "structured") {
            num += countInstructions(instr.immediate.expression);
            if (instr.immediate.expression2) num += countInstructions(instr.immediate.expression2);
        }
    }
    return num;
}

function peepholeOptimisations(expr: WExpression) {
    const flags = getFlags();
    peepholeMulti(expr, peepholeOptimisers.filter(x => x.enabled(flags)).map(x => [x.run, x.peepholeSize]));
}

optimisers.push({
    name: "Peephole optimisations",
    enabled: () => true,
    run: peepholeOptimisations
});

optimisers.push({
    name: "Partial redundancy elimination",
    enabled: (flags) => flags.partial_redundancy_elimination,
    run: pre
});

optimisers.push({
    name: "Dead code elimination",
    enabled: (flags) => flags.dead_code_elimination,
    run: deadCodeElimination
});

optimisers.push({
    name: "Copy propagation",
    enabled: (flags) => flags.copy_propagation,
    run: copyPropagation
});

optimisers.push({
    name: "Local live range splitting",
    enabled: (flags) => flags.live_range_splitting,
    run: rangeSplitting
});

optimisers.push({
    name: "Reallocate locals",
    enabled: (flags) => flags.reallocate_locals,
    run: realloc_locals // must be ran when there are no redundant variables, i.e. immediate after copy propagation
});

optimisers.push({
    name: "Dead code elimination 2nd pass",
    enabled: (flags) => flags.dead_code_elimination,
    run: deadCodeElimination
});

optimisers.push({
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

optimisers.push({
    name: "Peephole optimisations 2nd pass",
    enabled: (flags) => flags.peephole_2nd_pass,
    run: peepholeOptimisations
});
