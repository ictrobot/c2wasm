import {gInstr} from "../../generation/expressions";
import {WExpression, Instructions} from "../../wasm";
import {InstrFlow, simplifiedControlFlow, Flow} from "./control_flow";
import {framework} from "./framework";

type DUChain = { // def-use chain
    readonly local: bigint,
    possibleUses: InstrFlow[], // instructions which reference this definition
    definiteUses: InstrFlow[], // instructions which reference this definition and no other possible definition
    bit: bigint,
} & ({type: "arg"} | {type: "local.set" | "local.tee", flow: InstrFlow});

function reachingDefinitions(expr: WExpression): { definitions: DUChain[], reaching: Map<Flow, bigint>, localMasks: bigint[] } {
    const cfg = simplifiedControlFlow(expr, instr => instr.name.startsWith("local."));

    const reaching = new Map<Flow, bigint>();
    const flowDefMap = new Map<InstrFlow, DUChain>();
    const duChains: DUChain[] = [];

    // masks containing the bits for each local allowing quick killing of all a locals definitions
    const localMasks: bigint[] = Array(expr.builder.args.length + expr.builder.locals.length).fill(0n);

    // entry definitions are the function parameters
    let entryDefinitions = 0n;
    for (let i = 0n; i < expr.builder.args.length; i++) {
        const d: DUChain = {
            local: i, type: "arg",
            possibleUses: [], definiteUses: [],
            bit: 1n << BigInt(duChains.length)
        };
        entryDefinitions |= d.bit;
        localMasks[Number(i)] |= d.bit;
        duChains.push(d);
    }
    reaching.set(cfg.entry, entryDefinitions);

    // definition objects for each of local.set/tee instructions
    for (const f of cfg.all) {
        if (f.instr.type === "index" && (f.instr.name === "local.set" || f.instr.name === "local.tee")) {
            const d: DUChain = {
                local: f.instr.immediate.value, type: f.instr.name,
                possibleUses: [], definiteUses: [],
                flow: f, bit: 1n << BigInt(duChains.length)
            };
            localMasks[Number(d.local)] |= d.bit;
            flowDefMap.set(f, d);
            duChains.push(d);
        }
    }

    framework(cfg, null, reaching,"forwards", "union", (f, x) => {
        const flowDef = flowDefMap.get(f);
        if (flowDef) {
            x &= ~localMasks[Number(flowDef.local)];
            x |= flowDef.bit;
        }
        return x;
    });

    // fill in usage info
    for (const [flow, defs] of reaching.entries()) {
        if (!flow.instr || flow.instr.type !== "index" || flow.instr.name !== "local.get") continue;
        const local = flow.instr.immediate.value;

        const localDefs = [];
        for (let i = 0, bits = defs & localMasks[Number(local)]; bits; i++) {
            if (bits & 1n) localDefs.push(duChains[i]);
            bits >>= 1n;
        }

        if (localDefs.length === 1) {
            localDefs[0].definiteUses.push(flow);
        }
        localDefs.forEach(d => d.possibleUses.push(flow));
    }

    return {definitions: duChains, reaching, localMasks};
}

export function copyPropagation(expr: WExpression): void {
    const {definitions, reaching, localMasks} = reachingDefinitions(expr);
    if (!definitions.length) return; // couldn't analyze

    for (const def of definitions) {
        if (def.type === "arg") continue;

        if (def.possibleUses.length === 0) {
            // never used so drop the assignment
            dropAssignment(def.flow);
            continue;
        }

        // check if there are definite uses which we would be able to inline / propagate
        if (def.definiteUses.length === 0) continue;

        const prevInstr = def.flow.expr.instructions[def.flow.instrIndex - 1];
        if (prevInstr?.type === "constant") {
            // constant propagation
            const replacement = gInstr(def.flow.instr.parameters[0], "const", prevInstr.immediate.value);

            for (const use of def.definiteUses) {
                use.expr.replace(use.instrIndex, use.instrIndex + 1, replacement);
            }
        } else if (prevInstr?.type === "index" && (prevInstr.name === "local.get" || prevInstr.name === "local.tee")) {
            // copy propagation
            const getFlow = [...def.flow.flowPrevious].find(f => f.instr && f.instrIndex === def.flow.instrIndex - 1 && f.expr === def.flow.expr);
            if (!getFlow) continue; // needed to look up the valid definitions
            const getLocal = Number(prevInstr.immediate.value);
            const getDefs = (reaching.get(getFlow) ?? 0n) & localMasks[getLocal];

            const replacement = Instructions.local.get(getLocal);
            let replacedAll = true;
            for (const use of def.definiteUses) {
                if (getDefs === ((reaching.get(use) ?? 0n) & localMasks[getLocal])) {
                    // have to be careful to only replace where the same definition of getLocal is validate
                    use.expr.replace(use.instrIndex, use.instrIndex + 1, replacement);
                } else {
                    replacedAll = false; // getLocal has been redefined so can't replace
                }
            }
            if (!replacedAll) continue;
        } else {
            continue;
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
