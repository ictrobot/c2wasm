import {WFunctionBuilder, WExpression} from "../wasm";
import {InstrInstance, PartialInstr} from "../wasm/instr_helpers";

export interface Optimizer {
    name: string,
    run(fn: WFunctionBuilder, expr: WExpression): void
}

type PeepholeCallback = (instr: InstrInstance[], depth: number) => (InstrInstance | PartialInstr)[] | undefined;
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
