import {WExpression, Instructions} from "../wasm";
import {labelidx} from "../wasm/base_types";
import {WLocal} from "../wasm/functions";
import {InstrInstance} from "../wasm/instr_helpers";
import {deadCodeElimination} from "./dead_code";
import {getFlags} from "./flags";
import {Optimizer} from "./optimizer";
import {peephole, peepholeMulti, peepholeOptimizers} from "./peephole";

const optimizers: Optimizer[] = [];

export function optimize(expr: WExpression): void {
    const flags = getFlags();
    for (const optimizer of optimizers) {
        if (optimizer.enabled(flags)) optimizer.run(expr);
    }
}

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

optimizers.push({
    name: "peephole optimizations",
    enabled: () => true,
    run: (expr) => {
        const flags = getFlags();
        peepholeMulti(expr, peepholeOptimizers.filter(x => x.enabled(flags)).map(x => [x.run, x.peepholeSize]));
    }
});

optimizers.push({
    name: "remove unused blocks and loops",
    enabled: (flags) => flags.unused_blocks,
    run: (expr) => {
        peephole(expr, ([instr]) => {
            if (instr.type !== "structured" || instr.name === "if" || instr.args.type !== null) return;
            if (branchedTo(instr)) return;

            // we can remove the block/loop as nothing branches to it
            const replacement = instr.args.expression;
            // however we must decrement the values of branch instructions inside the block which branch outside
            peephole(replacement, ([child], depth) => {
                if (child.type === "index") {
                    if (child.args.value < depth) return;

                    if (child.name === "br") {
                        return [Instructions.br(child.args.value - 1n as labelidx)];
                    } else if (child.name === "br_if") {
                        return [Instructions.br_if(child.args.value - 1n as labelidx)];
                    }
                } else if (child.type === "table" && child.name === "br_table") {
                    const {defaultValue, valueTable} = child.args;
                    return [Instructions.br_table(
                        (defaultValue < depth ? defaultValue : defaultValue - 1n) as labelidx,
                        valueTable.map(v => (v < depth ? v : v - 1n) as labelidx)
                    )];
                }
            }, 1);

            return replacement.instructions.slice();
        }, 1);
    }
});

optimizers.push({
    name: "Basic dead code elimination",
    enabled: (flags) => flags.dead_code_elimination,
    run: deadCodeElimination
});

optimizers.push({
    name: "Remove unused locals",
    enabled: (flags) => flags.unused_locals,
    run: (expr) => {
        const usedLocals = new Set<WLocal>();
        for (const resource of expr.writes) {
            if (resource instanceof WLocal && !resource.isArgument) usedLocals.add(resource);
        }
        if (usedLocals.size === expr.builder.locals.length) return;

        // store current list of locals to enable lookup when re-encoding
        const oldLocals = expr.builder.args.slice();
        oldLocals.push(...expr.builder.locals);

        // remove any unused locals from builder
        for (const local of expr.builder.locals.slice()) { // slice needed to avoid modifying whilst iterating
            if (!usedLocals.has(local)) expr.builder.deleteLocal(local);
        }

        // now have to re-encode any local instructions
        peephole(expr, ([instr]) => {
            if (instr.type !== "index" || !instr.name.startsWith("local.")) return;
            const local = oldLocals[Number(instr.args.value)];

            if (instr.name === "local.get") {
                return [Instructions.local.get(local)];
            } else if (instr.name === "local.set") {
                return [Instructions.local.set(local)];
            } else if (instr.name === "local.tee") {
                return [Instructions.local.tee(local)];
            }
        }, 1);
    }
});

function branchedTo(instr: InstrInstance, depth = -1n): boolean {
    if (instr.type === "index" && instr.name.startsWith("br")) {
        return instr.args.value === depth;
    }
    if (instr.type === "table" && instr.name === "br_table") {
        return instr.args.defaultValue === depth || instr.args.valueTable.some(x => x === depth);
    }
    if (instr.type !== "structured") return false;

    const {expression, expression2} = instr.args;
    if (expression.instructions.some(child => branchedTo(child, depth + 1n))) return true;
    if (expression2 === undefined) return false;
    return expression2.instructions.some(child => branchedTo(child, depth + 1n));
}
