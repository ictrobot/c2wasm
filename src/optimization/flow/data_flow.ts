import type {WExpression} from "../../wasm";
import {expr2flow, InstrFlow} from "./control_flow";

export type Definition = {
    readonly local: bigint,
    possibleUses: InstrFlow[], // instructions which reference this definition
    definiteUses: InstrFlow[], // instructions which reference this definition and no other possible definition
} & ({type: "arg"} | {type: "local.set" | "local.tee", flow: InstrFlow});

export function reachingDefinitions(expr: WExpression): Definition[] {
    const {all} = expr2flow(expr);
    if (all.length === 0) return [];

    const reachingDefs = new Map<InstrFlow, Set<Definition>>();
    const flowDefMap = new Map<InstrFlow, Definition>();
    const allDefinitions: Definition[] = [];
    const queue = new Set<InstrFlow>();

    // entry definitions are the function parameters
    const entryDefinitions = new Set<Definition>();
    for (let i = 0n; i < expr.builder.args.length; i++) {
        const d: Definition = {local: i, type: "arg", possibleUses: [], definiteUses: []};
        entryDefinitions.add(d);
        allDefinitions.push(d);
    }

    for (const f of all) {
        reachingDefs.set(f, new Set());
        queue.add(f);

        if (f.instr.type === "index" && (f.instr.name === "local.set" || f.instr.name === "local.tee")) {
            const d: Definition = {possibleUses: [], definiteUses: [], local: f.instr.immediate.value, type: f.instr.name, flow: f};
            flowDefMap.set(f, d);
            allDefinitions.push(d);
        }
    }

    let next: IteratorResult<InstrFlow, InstrFlow>;
    while ((next = queue.keys().next()).value) {
        const flow = next.value;
        queue.delete(flow);
        // OUT[n] = GEN[n] Union (IN[n] -KILL[n]);

        const S = new Set<Definition>();
        for (const p of flow.flowPrevious) {
            let pSet;
            if (p.type === "instr") {
                pSet = reachingDefs.get(p);
            } else if (p.type === "entry") {
                pSet = entryDefinitions;
            }
            if (pSet) {
                for (const value of pSet) S.add(value);
            }
        } // S = IN[n]

        const flowDef = flowDefMap.get(flow);
        if (flowDef) {
            for (const existing of S) {
                if (flowDef.local === existing.local) {
                    // @ts-ignore
                    if (flowDef.local === 6n && existing.type === "local.set" && [...existing.flow.flowPrevious][0].instr.encoded[1] === 8) {
                        // debugger;
                    }
                    S.delete(existing);
                }
            } // S = IN[n] - KILL[n]

            S.add(flowDef);
        } // S = OUT[n]

        if (!setEquals(S, reachingDefs.get(flow))) {
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
        const localDefs = [...defs].filter(x => x.local === local);

        if (localDefs.length === 1) {
            localDefs[0].definiteUses.push(flow);
        }
        localDefs.forEach(d => d.possibleUses.push(flow));
    }

    return allDefinitions;
}

function setEquals<T>(a: Set<T>, b: Set<T> | undefined): boolean {
    if (!b || a.size !== b.size) return false;
    for (const x of a) {
        if (!b.has(x)) return false;
    }
    return true;
}
