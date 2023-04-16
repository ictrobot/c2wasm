import {WExpression, ValueType, Instructions} from "../../wasm";
import {WLocal} from "../../wasm/functions";
import {simplifiedControlFlow, Flow} from "./control_flow";

export function rangeSplitting(expr: WExpression): void {
    const cfg = simplifiedControlFlow(expr, x => x.name.startsWith("local."));
    const localsMap = new Map<Flow, LocalRange[]>();
    const definitionMap = new Map<Flow, LocalRange>();

    const queue = cfg.entry.flowNext.slice();

    let flow: Flow | undefined;
    while ((flow = queue.shift()) !== undefined) {
        const ranges: LocalRange[] = [];
        for (const prev of flow.flowPrevious) {
            for (const [i, local] of (localsMap.get(prev) ?? []).entries()) {
                if (!local) continue;
                if (ranges[i] !== undefined) {
                    ranges[i] = ranges[i].merge(local);
                } else {
                    ranges[i] = local.get();
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
            for (const next of flow.flowNext) queue.push(next);
        }
    }

    const allLocals = [...new Set([...definitionMap.values()].map(x => x.get()))];
    if (allLocals.length <= expr.builder.locals.length) return;

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

    merge(other: LocalRange): LocalRange {
        if (this === other) return this.get();

        if (this.target) {
            return this.target.merge(other);
        } else if (other.id < this.id) {
            other.merge(this);
            return this.get();
        } else {
            this.target = other;
            return other.get();
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
