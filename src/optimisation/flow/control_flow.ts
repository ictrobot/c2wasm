import {WExpression} from "../../wasm";
import {InstrInstance} from "../../wasm/instr_helpers";

export function controlFlow(expr: WExpression): ControlFlowGraph {
    const entryFlow: MarkerFlow = {type: "entry", instr: undefined, flowPrevious: [], flowNext: []};
    const exitFlow: MarkerFlow = {type: "exit", instr: undefined, flowPrevious: [], flowNext: []};
    const allFlows: Flow[] = [entryFlow, exitFlow];
    const brTargets: Flow[] = [];

    function _expr2flow(expr: WExpression, previousFlow: Flow, followingFlow: Flow) {
        const instructions = expr.instructions;
        const flows: Flow[] = [];

        for (const [instrIndex, instr] of instructions.entries()) {
            flows.push({instr, instrIndex, expr, type: "instr", flowPrevious: [], flowNext: []});
        }
        allFlows.push(...flows);
        flows.push(followingFlow);

        for (let i = 0; i < instructions.length; i++) {
            const instr = instructions[i];
            const flow = flows[i];
            const nextFlow = flows[i + 1];

            if (instr.type === "structured" && instr.name === "if") {
                // br to if jumps to the first instruction after the loop
                brTargets.unshift(nextFlow);
                const child1 = _expr2flow(instr.immediate.expression, flow, nextFlow);
                const child2 = instr.immediate.expression2 && _expr2flow(instr.immediate.expression2, flow, nextFlow);
                brTargets.shift();

                if (child1 && child2) continue;

            } else if (instr.type === "structured") {
                // br to a loop jumps back to the loop, br to block jumps to the first instruction after the loop
                brTargets.unshift(instr.name === "loop" ? flow : nextFlow);
                const child = _expr2flow(instr.immediate.expression, flow, nextFlow);
                brTargets.shift();

                if (child) continue;

            } else if (instr.type === "index" && instr.name.startsWith("br")) {
                const target = brTargets[Number(instr.immediate.value)];
                if (!target) throw new Error("No such target for br?");
                flow.flowNext.push(target);

                if (instr.name !== "br_if") continue;

            } else if (instr.type === "table" && instr.name === "br_table") {
                for (const targetIdx of [instr.immediate.defaultValue, ...instr.immediate.valueTable]) {
                    const target = brTargets[Number(targetIdx)];
                    if (!target) throw new Error("No such target for br_table?");
                    flow.flowNext.push(target);
                }
                continue;

            } else if (instr.name === "return") {
                flow.flowNext.push(exitFlow);
                continue;
            }

            // flow passes through to next
            flow.flowNext.push(flows[i + 1]);
        }

        const initial = flows.find(x => x.type === "instr");
        if (initial) previousFlow.flowNext.push(initial);
        return !!initial;
    }

    _expr2flow(expr, entryFlow, exitFlow);

    // populate flowPrevious
    for (const flow of allFlows) {
        for (const next of flow.flowNext) {
            next.flowPrevious.push(flow);
        }
    }

    return {entry: entryFlow, exit: exitFlow, all: allFlows.filter(x => x.type === "instr") as InstrFlow[]};
}

export function simplifiedControlFlow(expr: WExpression, filter: (instr: InstrInstance) => boolean): ControlFlowGraph {
    const {entry, exit, all} = controlFlow(expr);
    const newAll: InstrFlow[] = [];

    for (const flow of all) {
        if (flow.flowPrevious.length === 1 && flow.flowNext.length === 1 && !filter(flow.instr)) {
            const previous = flow.flowPrevious[0];
            const next = flow.flowNext[0];

            previous.flowNext[previous.flowNext.indexOf(flow)] = next;
            next.flowPrevious[next.flowPrevious.indexOf(flow)] = previous;
        } else {
            newAll.push(flow);
        }
    }

    return {entry, exit, all: newAll};
}

export interface InstrFlow {
    type: "instr"
    instr: InstrInstance;
    expr: WExpression;
    instrIndex: number;

    // instructions which could be the previous executed instruction
    flowPrevious: Flow[];
    // instructions which could be the next executed instruction
    flowNext: Flow[];
}

export interface MarkerFlow {
    type: "entry" | "exit";
    instr: undefined;

    flowPrevious: Flow[];
    flowNext: Flow[];
}

export type Flow = InstrFlow | MarkerFlow;
export type ControlFlowGraph = {entry: MarkerFlow, exit: MarkerFlow, all: InstrFlow[]};
