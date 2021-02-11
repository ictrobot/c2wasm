import {WExpression, ValueType, Instructions} from "../../wasm";
import {WLocal} from "../../wasm/functions";
import {simplifiedControlFlow, Flow} from "./control_flow";

export function rangeSplitting(expr: WExpression) {
    const cfg = simplifiedControlFlow(expr, x => x.name.startsWith("local."));
    const localsMap = new Map<Flow, LocalRange[]>();
    const definitionMap = new Map<Flow, LocalRange>();

    const queue = new Set<Flow>(cfg.entry.flowNext);
    let next: IteratorResult<Flow, Flow>;
    while ((next = queue.keys().next()).value) {
        const flow = next.value;
        queue.delete(flow);

        const ranges: LocalRange[] = [];
        for (const prev of flow.flowPrevious) {
            for (const [i, local] of (localsMap.get(prev) ?? []).entries()) {
                if (!local) continue;
                if (ranges[i] !== undefined) {
                    ranges[i].merge(local);
                } else {
                    ranges[i] = local;
                }
            }
        }

        if (flow.instr && flow.instr.type === "index" && (flow.instr.name === "local.set" || flow.instr.name === "local.tee")) {
            const i = Number(flow.instr.immediate.value) - expr.builder.args.length;
            if (i >= 0) {
                let local = definitionMap.get(flow);
                if (!local) definitionMap.set(flow, local = new LocalRange(flow.instr.parameters[0]));
                ranges[i] = local;
            }
        }

        const existing = localsMap.get(flow);
        if (!existing || existing.length !== ranges.length || existing.some((x, i) => ranges[i] !== x)) {
            localsMap.set(flow, ranges);
            for (const next of flow.flowNext) queue.add(next);
        }
    }

    const allLocals = [...new Set([...definitionMap.values()].map(x => x.get()))];
    if (allLocals.length === expr.builder.locals.length) return;

    expr.builder.wipeLocals();
    for (const l of allLocals) l.newLocal = expr.builder.addLocal(l.type);

    for (const [flow, ranges] of localsMap.entries()) {
        if (!flow.instr || flow.instr.type !== "index") continue;
        const index = Number(flow.instr.immediate.value) - expr.builder.args.length;
        if (index < 0) continue;

        if (flow.instr.name === "local.get") {
            flow.expr.replace(flow.instrIndex, flow.instrIndex + 1, Instructions.local.get(ranges[index].getNewLocal()));
        } else if (flow.instr.name === "local.set") {
            flow.expr.replace(flow.instrIndex, flow.instrIndex + 1, Instructions.local.set(ranges[index].getNewLocal()));
        } else if (flow.instr.name === "local.tee") {
            flow.expr.replace(flow.instrIndex, flow.instrIndex + 1, Instructions.local.tee(ranges[index].getNewLocal()));
        }
    }
}

let localId = 0;
class LocalRange {
    readonly id = localId++;
    private target?: LocalRange;
    newLocal?: WLocal;

    constructor(readonly type: ValueType) {
    }

    merge(other: LocalRange): void {
        if (this === other) return;

        if (this.target) {
            this.target.merge(other);
        } else if (other.id < this.id) {
            other.merge(this);
        } else {
            this.target = other;
        }
    }

    get(): LocalRange {
        if (this.target) return this.target.get();
        return this;
    }

    getNewLocal(): WLocal {
        if (this.target) return this.target.getNewLocal();
        if (!this.newLocal) throw new Error("No new local assigned?");
        return this.newLocal;
    }
}
