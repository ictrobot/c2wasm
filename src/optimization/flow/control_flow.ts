import {WExpression} from "../../wasm";
import {InstrInstance} from "../../wasm/instr_helpers";

function _expr2flow(expr: WExpression,
                    allFlows: Flow[],
                    brTargets: Flow[],
                    followingFlow: Flow,
                    exitFlow: Flow & {type: "exit"}): InstrFlow | undefined {

    const instructions = expr.instructions;
    const flows: Flow[] = instructions.map(x => ({instr: x, type: "instr", flowPrevious: new Set(), flowNext: new Set()}));
    allFlows.push(...flows);
    flows.push(followingFlow);

    for (let i = 0; i < instructions.length; i++) {
        const instr = instructions[i];
        const flow = flows[i] as InstrFlow;

        if (instr.type === "structured" && instr.name === "if") {
            // br to if jumps to the first instruction after the loop
            brTargets.unshift(flows[i + 1]);

            const child1 = _expr2flow(instr.immediate.expression, allFlows, brTargets, flows[i + 1], exitFlow);

            let child2 = undefined;
            if (instr.immediate.expression2) {
                child2 = _expr2flow(instr.immediate.expression2, allFlows, brTargets, flows[i + 1], exitFlow);
            }

            brTargets.shift();

            if (child1) flow.flowNext.add(child1);
            if (child2) flow.flowNext.add(child2);
            if ((!child1 || !child2) && flows[i + 1]) {
                // at least one child empty so flow will pass to next instruction
                flow.flowNext.add(flows[i + 1]);
            }

        } else if (instr.type === "structured") {
            // br to a loop jumps back to the loop, br to block jumps to the first instruction after the loop
            brTargets.unshift(instr.name === "loop" ? flow : flows[i + 1]);
            const child = _expr2flow(instr.immediate.expression, allFlows, brTargets, flows[i + 1], exitFlow);
            brTargets.shift();

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
export function controlFlow(expr: WExpression) {
    const allFlows: Flow[] = [];
    const entryFlow: Flow & {type: "entry"} = {type: "entry", instr: undefined, flowPrevious: new Set(), flowNext: new Set()};
    const exitFlow: Flow & {type: "exit"} = {type: "exit", instr: undefined, flowPrevious: new Set(), flowNext: new Set()};

    if (!expr.writes.includes("arbitraryCode")) {
        const initialFlow = _expr2flow(expr, allFlows, [], exitFlow, exitFlow);
        if (initialFlow) {
            entryFlow.flowNext.add(initialFlow);
            initialFlow.flowPrevious.add(entryFlow);
        }

        // populate flowPrevious
        for (const flow of allFlows) {
            for (const next of flow.flowNext) {
                next.flowPrevious.add(flow);
            }
        }
    }

    return {entry: entryFlow, exit: exitFlow, all: allFlows.filter(x => x.type === "instr") as InstrFlow[]};
}

export interface InstrFlow {
    type: "instr"
    instr: InstrInstance;

    // instructions which could be the previous executed instruction
    flowPrevious: Set<Flow>;
    // instructions which could be the next executed instruction
    flowNext: Set<Flow>;
}

export interface MarkerFlow {
    type: "entry" | "exit";
    instr: undefined;

    flowPrevious: Set<Flow>;
    flowNext: Set<Flow>;
}

export type Flow = InstrFlow | MarkerFlow;
