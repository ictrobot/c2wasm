import {gInstr} from "../../generation/expressions";
import {WExpression, Instructions} from "../../wasm";
import {InstrFlow} from "./control_flow";
import {reachingDefinitions} from "./data_flow";

export function constantPropagation(expr: WExpression): void {
    const definitions = reachingDefinitions(expr);
    if (!definitions.length) return; // couldn't analyze

    for (const def of definitions) {
        if (def.type === "arg") continue;

        if (def.possibleUses.length === 0) {
            // never used so drop the assignment
            if (dropAssignment(def.flow)) return constantPropagation(expr);
            continue;
        }

        // check if there are definite uses which we would be able to inline
        if (def.definiteUses.length === 0) continue;

        // check if assigned a constant
        const prevInstr = def.flow.expr.instructions[def.flow.instrIndex - 1];
        if (!prevInstr || prevInstr.type !== "constant") continue;

        const constantValue = prevInstr.immediate.value;
        const constantInstr = gInstr(def.flow.instr.parameters[0], "const", constantValue);

        // inline constant in all the definite uses
        for (const use of def.definiteUses) {
            use.expr.replace(use.instrIndex, use.instrIndex + 1, constantInstr);
        }

        if (def.definiteUses.length === def.possibleUses.length) {
            // can remove the assignment if no extra possible uses
            if (dropAssignment(def.flow)) return constantPropagation(expr);
        }
    }
}

function dropAssignment(f: InstrFlow): boolean /* if removed instr so indices now invalid */ {
    if (f.instr.name === "local.tee") {
        f.expr.replace(f.instrIndex, f.instrIndex + 1, /* nothing */);
        return true;
    } else if (f.instr.name === "local.set") {
        f.expr.replace(f.instrIndex, f.instrIndex + 1, Instructions.drop());
    }
    return false;
}
