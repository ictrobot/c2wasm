import {WFunctionBuilder, WExpression} from "../wasm";
import {InstrInstance, PartialInstr} from "../wasm/instr_helpers";

export interface Optimizer {
    name: string,
    run(fn: WFunctionBuilder, expr: WExpression): void
}

export function peephole(expr: WExpression, fn: (instr: InstrInstance[]) => PartialInstr[] | undefined, size: number): void {
    for (let i = 0; i <= expr.instructions.length - size; i++) {
        const replacement = fn(expr.instructions.slice(i, i + size));
        if (replacement !== undefined) {
            expr.replace(i, i + size, ...replacement);
            i--; // repeat with new instructions
        }
    }

    for (const instruction of expr.instructions) {
        if (instruction.type === "structured") {
            peephole(instruction.args.expression, fn, size);
            if (instruction.args.expression2) peephole(instruction.args.expression2, fn, size);
        }
    }
}
