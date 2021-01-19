import type {ControlFlowGraph, InstrFlow, Flow} from "./control_flow";

export function framework<T>(
    cfg: ControlFlowGraph,
    setMap: Map<Flow, Set<T>>,
    direction: "forwards" | "backwards",
    meetOperation: "union" | "intersection",
    transferFunction: (f: InstrFlow, x: Set<T>) => Set<T>
): void {

    const queue = new Set<InstrFlow>();

    for (const starting of (direction === "forwards" ? cfg.entry.flowNext : cfg.exit.flowPrevious)) {
        if (starting.instr) queue.add(starting);
    }

    let next: IteratorResult<InstrFlow, InstrFlow>;
    while ((next = queue.keys().next()).value) {
        const flow = next.value;
        queue.delete(flow);

        let X = undefined;
        for (const before of (direction === "forwards" ? flow.flowPrevious : flow.flowNext)) {
            const beforeSet = setMap.get(before as InstrFlow);

            if (X === undefined) {
                X = beforeSet;
            } else if (meetOperation === "union") {
                if (!beforeSet) continue;
                for (const v of beforeSet) {
                    X.add(v);
                }
            } else if (meetOperation === "intersection") {
                if (beforeSet) {
                    for (const v of X) {
                        if (!beforeSet.has(v)) X.delete(v);
                    }
                } else {
                    X.clear();
                }
            }
        }

        X = transferFunction(flow, X ?? new Set<T>());

        if (!setEquals(X, setMap.get(flow))) {
            setMap.set(flow, X);

            for (const after of (direction === "forwards" ? flow.flowNext : flow.flowPrevious)) {
                if (after.instr) queue.add(after);
            }
        }
    }
}

export function frameworkBits(
    cfg: ControlFlowGraph,
    bitMap: Map<Flow, bigint>,
    direction: "forwards" | "backwards",
    meetOperation: "union" | "intersection",
    transferFunction: (f: InstrFlow, x: bigint) => bigint
): void {

    const queue = new Set<InstrFlow>();

    for (const starting of (direction === "forwards" ? cfg.entry.flowNext : cfg.exit.flowPrevious)) {
        if (starting.instr) queue.add(starting);
    }

    let next: IteratorResult<InstrFlow, InstrFlow>;
    while ((next = queue.keys().next()).value) {
        const flow = next.value;
        queue.delete(flow);

        let X = undefined;
        for (const before of (direction === "forwards" ? flow.flowPrevious : flow.flowNext)) {
            const beforeSet = bitMap.get(before as InstrFlow) ?? 0n;

            if (X === undefined) {
                X = beforeSet;
            } else if (meetOperation === "union") {
                X |= beforeSet;
            } else { // intersection
                X &= beforeSet;
            }
        }

        X = transferFunction(flow, X ?? 0n);

        if (X !== bitMap.get(flow)) {
            bitMap.set(flow, X);

            for (const after of (direction === "forwards" ? flow.flowNext : flow.flowPrevious)) {
                if (after.instr) queue.add(after);
            }
        }
    }
}

function setEquals<T>(a: Set<T>, b?: Set<T>): boolean {
    if (!b || a.size !== b.size) return false;
    for (const x of a) {
        if (!b.has(x)) return false;
    }
    return true;
}
