import {WExpression} from "../wasm";
import {InstrInstance} from "../wasm/instr_helpers";

function _expr2flow(expr: WExpression,
                    allFlows: Flow[],
                    brTargets: Flow[],
                    followingFlow: Flow,
                    exitFlow: Flow & {type: "exit"}): InstrFlow | undefined {

    const instructions = expr.instructions;
    const flows: Flow[] = instructions.map(x => ({instr: x, type: "instr", flowPrevious: new Set(), flowNext: new Set()}));
    allFlows.push(...flows);
    flows.push(followingFlow);

    // link instrPrevious, instrNext, instrChild
    for (let i = 0; i < instructions.length; i++) {
        const flowBefore = flows[i - 1] as InstrFlow | undefined;
        const flowCurrent = flows[i] as InstrFlow;
        const flowNext = flows[i + 1] as Flow; // only possible non-InstrFlow is the final item in the flows list

        if (flowNext.type === "instr") flowCurrent.instrNext = flowNext;
        if (flowBefore?.type === "instr") flowCurrent.instrPrevious = flowBefore;

        const instr = instructions[i];
        if (instr.type === "structured") {
            if (instr.name === "loop") {
                // br to a loop jumps back to the loop
                brTargets.unshift(flowCurrent);
            } else {
                // br to an if or block jumps to the first instruction after the loop
                brTargets.unshift(flowNext);
            }

            flowCurrent.instrChild = _expr2flow(instr.immediate.expression, allFlows, brTargets, flowNext, exitFlow);
            if (instr.immediate.expression2) {
                flowCurrent.instrChild2 = _expr2flow(instr.immediate.expression2, allFlows, brTargets, flowNext, exitFlow);
            }

            brTargets.shift();
        }
    }

    // link the flows
    for (let i = 0; i < instructions.length; i++) {
        const instr = instructions[i];
        const flow = flows[i] as InstrFlow;

        if (instr.type === "structured" && instr.name === "if") {
            const child1 = flow.instrChild, child2 = flow.instrChild2;
            if (child1) flow.flowNext.add(child1);
            if (child2) flow.flowNext.add(child2);
            if ((!child1 || !child2) && flows[i + 1]) {
                // at least one child empty so flow will pass to next instruction
                flow.flowNext.add(flows[i + 1]);
            }

        } else if (instr.type === "structured") {
            const child = flow.instrChild;
            if (child) {
                flow.flowNext.add(child);
            } else if (flows[i + 1]) {
                // block/loop empty so flow will pass to next instruction
                flow.flowNext.add(flows[i + 1]);
            }

        } else if (instr.type === "index" && instr.name.startsWith("br")) {
            const target = brTargets[Number(instr.immediate.value)];
            if (!target) {
                throw new Error("No such target for br?");
            }
            flow.flowNext.add(target);

            if (instr.name === "br_if" && flows[i + 1]) {
                flow.flowNext.add(flows[i + 1]);
            }

        } else if (instr.type === "table" && instr.name === "br_table") {
            const targets = [instr.immediate.defaultValue, ...instr.immediate.valueTable];
            for (const targetIdx of targets) {
                const target = brTargets[Number(targetIdx)];
                if (!target) throw new Error("No such target for br_table?");
                flow.flowNext.add(target);
            }

        } else if (instr.name === "return") {
            flow.flowNext.add(exitFlow);

        } else if (flows[i + 1]) {
            flow.flowNext.add(flows[i + 1]);
        }
    }

    return flows.find(x => x.type === "instr") as InstrFlow;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function expr2flow(expr: WExpression) {
    const allFlows: Flow[] = [];
    const entryFlow: Flow & {type: "entry"} = {type: "entry", flowPrevious: new Set(), flowNext: new Set()};
    const exitFlow: Flow & {type: "exit"} = {type: "exit", flowPrevious: new Set(), flowNext: new Set()};

    if (!expr.writes.includes("arbitraryCode")) {
        const initialFlow = _expr2flow(expr, allFlows, [], exitFlow, exitFlow);
        if (initialFlow) entryFlow.flowNext.add(initialFlow);

        // populate flowPrevious
        for (const flow of allFlows) {
            for (const next of flow.flowNext) {
                next.flowPrevious.add(flow);
            }
        }
    }

    return {entry: entryFlow, exit: exitFlow, all: allFlows.filter(x => x.type === "instr") as InstrFlow[]};
}

export function flow2expr(flow: InstrFlow, expr2modify: WExpression): void {
    // TODO
}

export interface InstrFlow {
    type: "instr"
    instr: InstrInstance;

    // previous Wasm instruction
    instrPrevious?: InstrFlow;
    // next Wasm instruction
    instrNext?: InstrFlow;
    // if instr is structured, the start of its subexpressions
    instrChild?: InstrFlow, instrChild2?: InstrFlow;

    // instructions which could be the previous executed instruction
    flowPrevious: Set<Flow>;
    // instructions which could be the next executed instruction
    flowNext: Set<Flow>;
}

export type Flow = InstrFlow | {
    type: "entry" | "exit";
    flowPrevious: Set<Flow>;
    flowNext: Set<Flow>;
};
