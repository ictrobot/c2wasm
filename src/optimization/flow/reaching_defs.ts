import {gInstr} from "../../generation/expressions";
import {WExpression, Instructions} from "../../wasm";
import {InstrFlow, simplifiedControlFlow, Flow} from "./control_flow";
import {framework} from "./framework";

export type Definition = {
    readonly local: bigint,
    possibleUses: InstrFlow[], // instructions which reference this definition
    definiteUses: InstrFlow[], // instructions which reference this definition and no other possible definition
    bit: bigint,
} & ({type: "arg"} | {type: "local.set" | "local.tee", flow: InstrFlow});

export function reachingDefinitions(expr: WExpression): Definition[] {
    const cfg = simplifiedControlFlow(expr, instr => instr.name.startsWith("local."));

    const reachingDefs = new Map<Flow, bigint>();
    const flowDefMap = new Map<InstrFlow, Definition>();
    const allDefinitions: Definition[] = [];

    // masks containing the bits for each local allowing quick killing of all a locals definitions
    const defMask: bigint[] = Array(expr.builder.args.length + expr.builder.locals.length).fill(0n);

    // entry definitions are the function parameters
    let entryDefinitions = 0n;
    for (let i = 0n; i < expr.builder.args.length; i++) {
        const d: Definition = {
            local: i, type: "arg",
            possibleUses: [], definiteUses: [],
            bit: 1n << BigInt(allDefinitions.length)
        };
        entryDefinitions |= d.bit;
        defMask[Number(i)] |= d.bit;
        allDefinitions.push(d);
    }
    reachingDefs.set(cfg.entry, entryDefinitions);

    // definition objects for each of local.set/tee instructions
    for (const f of cfg.all) {
        if (f.instr.type === "index" && (f.instr.name === "local.set" || f.instr.name === "local.tee")) {
            const d: Definition = {
                local: f.instr.immediate.value, type: f.instr.name,
                possibleUses: [], definiteUses: [],
                flow: f, bit: 1n << BigInt(allDefinitions.length)
            };
            defMask[Number(d.local)] |= d.bit;
            flowDefMap.set(f, d);
            allDefinitions.push(d);
        }
    }

    framework(cfg, null, reachingDefs,"forwards", "union", (f, x) => {
        const flowDef = flowDefMap.get(f);
        if (flowDef) {
            x &= ~defMask[Number(flowDef.local)];
            x |= flowDef.bit;
        }
        return x;
    });

    // fill in usage info on each definition
    for (const [flow, defs] of reachingDefs.entries()) {
        if (!flow.instr || flow.instr.type !== "index" || flow.instr.name !== "local.get") continue;
        const local = flow.instr.immediate.value;

        const localDefs = [];
        for (let i = 0, bits = defs & defMask[Number(local)]; bits; i++) {
            if (bits & 1n) localDefs.push(allDefinitions[i]);
            bits >>= 1n;
        }

        if (localDefs.length === 1) {
            localDefs[0].definiteUses.push(flow);
        }
        localDefs.forEach(d => d.possibleUses.push(flow));
    }

    return allDefinitions;
}

export function constantPropagation(expr: WExpression): void {
    const definitions = reachingDefinitions(expr);
    if (!definitions.length) return; // couldn't analyze

    for (const def of definitions) {
        if (def.type === "arg") continue;

        if (def.possibleUses.length === 0) {
            // never used so drop the assignment
            dropAssignment(def.flow);
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
            dropAssignment(def.flow);
        }
    }
}

function dropAssignment(f: InstrFlow) {
    if (f.instr.name === "local.tee") {
        f.expr.replace(f.instrIndex, f.instrIndex + 1, Instructions.nop()); // use nop to avoid changing indices
    } else if (f.instr.name === "local.set") {
        f.expr.replace(f.instrIndex, f.instrIndex + 1, Instructions.drop());
    }
}
