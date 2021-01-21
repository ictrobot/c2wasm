import {WExpression, ValueType, Instructions} from "../../wasm";
import {WLocal} from "../../wasm/functions";
import {peephole} from "../peephole";
import {Flow, simplifiedControlFlow} from "./control_flow";
import {framework} from "./framework";

type ClashNode = {local: number, type: ValueType, clash: Set<number>};

export function realloc_locals(expr: WExpression): void {
    if (expr.builder.locals.length <= 1) return;

    const cfg = simplifiedControlFlow(expr, x => x.name.startsWith("local."));
    const liveMap = new Map<Flow, bigint>();
    const numArgs = BigInt(expr.builder.args.length);

    // LVA
    framework(cfg, null, liveMap, "backwards", "union", (f, x) => {
        // (out-live \ def) U ref
        if (f.instr && f.instr.type === "index") {
            const flag = 1n << (f.instr.immediate.value - numArgs);
            if (f.instr.name === "local.get") { // ref
                return x | flag;
            } else if (f.instr.name === "local.set" || f.instr.name === "local.tee") { // def
                return x & ~flag;
            }
        }
        return x;
    });

    // make clash graph
    const clashGraph: ClashNode[] = expr.builder.locals
        .map(({type}, local) => ({local, type: type, clash: new Set()}));
    for (let bits of liveMap.values()) {
        if (bits === 0n) continue;

        const live: number[] = [];
        for (let i = 0; bits; i++) {
            if (bits & 1n) live.push(i);
            bits >>= 1n;
        }
        if (live.length <= 1) continue;

        for (const i of live) {
            for (const j of live) i !== j && clashGraph[i].clash.add(j);
        }
    }

    // push vertex with the least edges onto a stack
    const stack: number[] = [];
    const clashCopy = clashGraph.map(({local, clash}) => ({local, clash: new Set(clash)}));
    while (clashCopy.length) {
        clashCopy.sort((a, b) => a.clash.size - b.clash.size);
        const {local} = clashCopy.shift() as ClashNode;
        stack.push(local);

        for (const node of clashCopy) node.clash.delete(local);
    }

    // pop and allocate
    expr.builder.wipeLocals();
    const locals: WLocal[] = [];
    const mapping: WLocal[] = Array(clashGraph.length);
    while (stack.length) {
        const oldLocal = stack.pop() as number;
        const {type} = clashGraph[oldLocal];

        const clashesWith = new Set<WLocal>();
        for (const c of clashGraph[oldLocal].clash) {
            if (mapping[c]) clashesWith.add(mapping[c]);
        }

        let newLocal = undefined;
        for (const local of locals) {
            if (local.type !== type) continue;
            if (clashesWith.has(local)) continue;
            newLocal = local;
            break;
        }
        if (!newLocal) locals.push(newLocal = expr.builder.addLocal(type));

        mapping[oldLocal] = newLocal;
    }
    mapping.unshift(...expr.builder.args); // add arguments back into mapping

    // transform according to the mapping
    remapLocals(expr, mapping);
}

export function remapLocals(expr: WExpression, mapping: WLocal[]): void {
    peephole(expr, ([instr]) => {
        if (instr.type !== "index" || !instr.name.startsWith("local.")) return;
        const local = mapping[Number(instr.immediate.value)];
        if (instr.name === "local.get") {
            return [Instructions.local.get(local)];
        } else if (instr.name === "local.set") {
            return [Instructions.local.set(local)];
        } else if (instr.name === "local.tee") {
            return [Instructions.local.tee(local)];
        }
    }, 1);
}
