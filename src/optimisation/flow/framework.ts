import type {ControlFlowGraph, InstrFlow, Flow} from "./control_flow";

export function framework(
    cfg: ControlFlowGraph,
    intermediateMap: Map<Flow, bigint> | null,
    bitMap: Map<Flow, bigint>,
    direction: "forwards" | "backwards",
    meetOperation: "union" | "intersection",
    transferFunction: (f: Flow, x: bigint) => bigint,
    intermediateOverride?: (f: Flow, x: bigint) => bigint
): void {

    const queue: Flow[] = (direction === "forwards" ? cfg.entry.flowNext : cfg.exit.flowPrevious)
        .filter(x => x.instr);

    let flow: Flow | undefined;
    while ((flow = queue.shift()) !== undefined) {
        let X = meetOperation === "union" ? 0n : -1n;
        for (const before of (direction === "forwards" ? flow.flowPrevious : flow.flowNext)) {
            const beforeBits = bitMap.get(before as InstrFlow) ?? 0n;

            if (meetOperation === "union") {
                X |= beforeBits;
            } else { // intersection
                X &= beforeBits;
            }
        }

        // used by PRE to force some values to false if not safe
        if (intermediateOverride) X = intermediateOverride(flow, X);
        // also used by PRE analysis
        if (intermediateMap) intermediateMap.set(flow, X);

        X = transferFunction(flow, X);

        if (X !== bitMap.get(flow)) {
            bitMap.set(flow, X);

            for (const after of (direction === "forwards" ? flow.flowNext : flow.flowPrevious)) {
                if (after.instr) queue.push(after);
            }
        }
    }
}

/*
// Implementation using JS sets instead of bits

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

function setEquals<T>(a: Set<T>, b?: Set<T>): boolean {
    if (!b || a.size !== b.size) return false;
    for (const x of a) {
        if (!b.has(x)) return false;
    }
    return true;
}
*/
