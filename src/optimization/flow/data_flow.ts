import type {WExpression} from "../../wasm";
import {InstrFlow, simplifiedControlFlow} from "./control_flow";

export type Definition = {
    readonly local: bigint,
    possibleUses: InstrFlow[], // instructions which reference this definition
    definiteUses: InstrFlow[], // instructions which reference this definition and no other possible definition
    bit: bigint,
} & ({type: "arg"} | {type: "local.set" | "local.tee", flow: InstrFlow});

export function reachingDefinitions(expr: WExpression): Definition[] {
    const {all} = simplifiedControlFlow(expr, instr => instr.name.startsWith("local."));
    if (all.length === 0) return [];

    const reachingDefs = new Map<InstrFlow, bigint>(); // each bit represents
    const flowDefMap = new Map<InstrFlow, Definition>();
    const allDefinitions: Definition[] = [];
    const queue = new Set<InstrFlow>();

    const numLocals = expr.builder.args.length + expr.builder.locals.length;
    // mask containing the bits for each local allowing quick killing of all a locals definitions
    const defMask: bigint[] = Array(numLocals).fill(0n);

    // entry definitions are the function parameters
    let entryDefinitions = 0n;
    for (let i = 0n; i < expr.builder.args.length; i++) {
        const d: Definition = {local: i, type: "arg", possibleUses: [], definiteUses: [], bit: 1n << BigInt(allDefinitions.length)};
        entryDefinitions |= d.bit;
        defMask[Number(i)] |= d.bit;
        allDefinitions.push(d);
    }

    for (const f of all) {
        reachingDefs.set(f, 0n);
        queue.add(f);

        if (f.instr.type === "index" && (f.instr.name === "local.set" || f.instr.name === "local.tee")) {
            const d: Definition = {possibleUses: [], definiteUses: [], local: f.instr.immediate.value, type: f.instr.name, flow: f, bit: 1n << BigInt(allDefinitions.length)};
            defMask[Number(d.local)] |= d.bit;
            flowDefMap.set(f, d);
            allDefinitions.push(d);
        }
    }

    let next: IteratorResult<InstrFlow, InstrFlow>;
    while ((next = queue.keys().next()).value) {
        const flow = next.value;
        queue.delete(flow);
        // OUT[n] = GEN[n] Union (IN[n] -KILL[n]);

        let S = 0n;
        for (const p of flow.flowPrevious) {
            let pSet;
            if (p.type === "instr") {
                pSet = reachingDefs.get(p);
            } else if (p.type === "entry") {
                pSet = entryDefinitions;
            }
            S |= pSet ?? 0n;
        } // S = IN[n]

        const flowDef = flowDefMap.get(flow);
        if (flowDef) {
            S &= ~defMask[Number(flowDef.local)]; // S = IN[n] - KILL[n]

            S |= flowDef.bit;
        } // S = OUT[n]

        if (S !== reachingDefs.get(flow)) {
            reachingDefs.set(flow, S);

            for (const n of flow.flowNext) {
                if (n.type === "instr") queue.add(n);
            }
        }
    }

    // fill in usage info on each definition
    for (const [flow, defs] of reachingDefs.entries()) {
        if (flow.instr.type !== "index" || flow.instr.name !== "local.get") continue;
        const local = flow.instr.immediate.value;
        const localDefs = allDefinitions.filter(d => (d.bit & defs) && d.local === local);

        if (localDefs.length === 1) {
            localDefs[0].definiteUses.push(flow);
        }
        localDefs.forEach(d => d.possibleUses.push(flow));
    }

    return allDefinitions;
}
