import {WExpression} from "../../wasm";
import {reachingDefinitions} from "./data_flow";

export function constantPropagation(expr: WExpression): void {
    const definitions = reachingDefinitions(expr);
    if (!definitions.length) return; // couldn't analyze

    console.log(expr.builder.fn.exportName);

    for (const def of definitions) {
        if (def.possibleUses.length === 0) {
            // never used so drop the assignment
            console.log("Assignment has no possible uses", def);
            continue;
        }

        // check if assigned a constant
        if (def.type === "arg" || def.flow.flowPrevious.size !== 1) continue;
        const [prevFlow] = def.flow.flowPrevious;
        if (prevFlow.type !== "instr" || prevFlow.instr.type !== "constant") continue;
        const constantValue = prevFlow.instr.immediate.value;

        // replace any usages where this is the only possible definition
        if (def.definiteUses.length > 0) {
            console.log("Candidate for constant propagation", def.definiteUses.length, def.possibleUses.length, def);
        }
    }
}
