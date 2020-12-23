import {WExpression, ValueType, Instructions} from "../wasm";
import {WLocal} from "../wasm/functions";
import {InstrInstance, PartialInstr} from "../wasm/instr_helpers";

export function deadCodeElimination(expr: WExpression, usedLocals = new Set<WLocal>()): void {
    const [instructions, stackItems] = dataflow(expr);

    // instructions which write to a non-local resource are definitely needed
    for (const instruction of instructions) {
        if (instruction.instr.writes.some(resource => !(resource instanceof WLocal))) {
            markNeeded(instruction);
        }
    }
    markRecursively(stackItems);

    // instructions writing to locals which are read after are also needed
    for (let i = instructions.length - 1; i >= 0; i--) {
        const instruction = instructions[i], instr = instruction.instr;

        if (!instruction.needed) {
            for (const write of instr.writes) {
                if (write instanceof WLocal && usedLocals.has(write)) {
                    markNeeded(instruction);
                    markRecursively(stackItems);
                    break;
                }
            }
        }

        if (instruction.needed) {
            // recursively check subexpressions now before other locals are marked as used
            if (instr.type === "structured") {
                // special case: loops may repeat code so just presume all locals are needed before recurring
                if (instr.name === "loop") {
                    for (const read of instr.reads) {
                        if (read instanceof WLocal) usedLocals.add(read);
                    }
                }

                deadCodeElimination(instr.args.expression, usedLocals);
                if (instr.args.expression2) deadCodeElimination(instr.args.expression2, usedLocals);

                if (instr.name === "loop") continue;
            }

            for (const read of instr.reads) {
                if (read instanceof WLocal) usedLocals.add(read);
            }
        }
    }

    if (instructions.some(instr => !instr.needed)) {
        // discard unneeded instructions if any
        const replacement: (PartialInstr | InstrInstance)[] = [];
        for (const instruction of instructions) {
            if (instruction.needed || instruction.instr.name === "unreachable") { // also preserve "unreachable" instructions
                replacement.push(instruction.instr);

                if (instruction.produces && !instruction.produces.needed) {
                    replacement.push(Instructions.drop());
                }
            }
        }
        expr.replace(0, expr.instructions.length, ...replacement);
    }
}

function dataflow(expr: WExpression): [DFInstruction[], DFStackItem[]] {
    const instructions = expr.instructions.map(instr => ({instr, produces: undefined, consumes: []} as DFInstruction));
    const stackItems: DFStackItem[] = [];

    const currentStack: DFStackItem[] = [];
    for (const dfInstr of instructions) {
        for (let i = 0; i < dfInstr.instr.parameters.length; i++) {
            const item = currentStack.pop() as DFStackItem;
            item.consumedBy = dfInstr;
            dfInstr.consumes.push(item);
        }

        if (dfInstr.instr.result !== null) {
            dfInstr.produces = {
                type: dfInstr.instr.result,
                producedBy: dfInstr,
                index: stackItems.length
            };
            currentStack.push(dfInstr.produces);
            stackItems.push(dfInstr.produces);
        }
    }

    // mark anything left on the stack as definitely needed
    for (const remainingItem of currentStack) remainingItem.needed = true;

    return [instructions, stackItems];
}

function markNeeded(instr: DFInstruction) {
    instr.needed = true;
    for (const item of instr.consumes) item.needed = true;
}

function markRecursively(items: DFStackItem[]) {
    let changed = 1;
    while (changed) {
        changed = 0;
        for (const item of items.filter(item => item.needed && !item.producedBy.needed)) {
            markNeeded(item.producedBy);
            changed++;
        }
    }
}

interface DFInstruction {
    instr: InstrInstance;
    produces: DFStackItem | undefined;
    consumes: DFStackItem[];
    needed?: true;
}

interface DFStackItem {
    type: ValueType;
    producedBy: DFInstruction;
    consumedBy?: DFInstruction;
    index: number;
    needed?: true;
}
