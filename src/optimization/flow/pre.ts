import {WExpression, ValueType, Instructions} from "../../wasm";
import {WLocal} from "../../wasm/functions";
import {WGlobal} from "../../wasm/global";
import {InstrInstance, ReadResource, PartialInstr} from "../../wasm/instr_helpers";
import {InstrFlow, controlFlow, ControlFlowGraph, InstrFlowSplicer, Flow} from "./control_flow";
import {framework} from "./framework";

// partial redundancy elimination
// https://dl.acm.org/doi/pdf/10.1145/307824.307851

// Local properties
// TRANSP - Transparent - expression operands are not modified by execution of statement
// ANTLOC - Locally anticipable - expression computed in basic block b and doesn't previous define operands
// COMP - Locally available - expression computed in basic block b and b doesn't later redefine operands

// Global properties
// AV[IN/OUT] - Availability
// ANT[IN/OUT] - Anticipability
// SPAV[IN/OUT] - Safe partial availability
// SPANT[IN/OUT] - Safe partial anticipability
// SAFE[IN,OUT] - Safe to insert a computation

interface SubExpr {
    positions: {start: number, end: number, expr: WExpression}[];
    instructions: InstrInstance[];
    resources: Set<ReadResource>;
    type: ValueType;
    bit: bigint;
}

interface ExprResult {
    expression: SubExpr;

    insertBefore: InstrFlow[]; // INSERT_i
    insertBetween: [InstrFlow, InstrFlow][]; // INSERT_{i,j}
    insertAfter: InstrFlow[]; // from edge insertion minimization
    insertInstructions: (InstrInstance | PartialInstr)[];

    replacementFlows: InstrFlow[]; // REPLACE
    replacementInstructions: (InstrInstance | PartialInstr)[];

    fnLengthChange: number;
}

function subExprMatches(s1: SubExpr, s2: SubExpr): boolean {
    if (s1.type !== s2.type || s1.instructions.length !== s2.instructions.length) return false;
    return s1.instructions.every((v, i) => {
        const arr1 = v.encoded, arr2 = s2.instructions[i].encoded;
        return arr1.length === arr2.length && arr1.every((v, i) => v === arr2[i]);
    });
}

function expressions(top: WExpression): SubExpr[] {
    const expressions: SubExpr[] = [];
    const exprQueue = [top];

    let expr;
    while ((expr = exprQueue.shift()) !== undefined) {
        const {instructions} = expr;

        instrLoop:
        for (const [i, startInstr] of instructions.entries()) {
            if (startInstr.type === "structured") {
                exprQueue.push(startInstr.immediate.expression);
                if (startInstr.immediate.expression2) exprQueue.push(startInstr.immediate.expression2);
                continue;
            }
            if (startInstr.parameters.length || startInstr.writes.length || !startInstr.result) {
                continue;
            }

            const stack = [startInstr.result];
            const resources = new Set(startInstr.reads);
            for (let j = i + 1; j < instructions.length; j++) {
                const instr = instructions[j];
                if (instr.parameters.length > stack.length || instr.writes.length) continue instrLoop;

                stack.splice(0, instr.parameters.length);
                if (instr.result) stack.unshift(instr.result);
                for (const resource of instr.reads) resources.add(resource);

                if (stack.length === 1 && (j - i) >= 2) {
                    const position = {start: i, end: j, expr};
                    const subExpr: SubExpr = {
                        positions: [position],
                        resources,
                        type: stack[0],
                        instructions: instructions.slice(i, j + 1),
                        bit: 1n << BigInt(expressions.length)
                    };

                    // see if there is an existing subexpr which matches
                    const matching = expressions.find(x => subExprMatches(x, subExpr));
                    if (matching) {
                        matching.positions.push(position);
                    } else {
                        expressions.push(subExpr);
                    }
                }
            }
        }
    }

    return expressions;
}

function transparent(cfg: ControlFlowGraph, expressions: SubExpr[]): (f: Flow) => bigint {
    const fullyTransparent = (1n << BigInt(expressions.length)) - 1n;
    const transpMap = new Map<InstrFlow, bigint>();
    for (const f of cfg.all) {
        let flags = fullyTransparent;
        if (f.instr.type !== "structured") {
            for (const resource of f.instr.writes) {
                if (resource === "memory" || resource instanceof WGlobal || resource instanceof WLocal) {
                    for (const [i, expression] of expressions.entries()) {
                        if (expression.resources.has(resource)) flags &= ~(1n << BigInt(i));
                    }
                }
            }
        } // structured instructions are themselves transparent
        transpMap.set(f, flags);
    }
    return (f) => transpMap.get(f as InstrFlow) ?? fullyTransparent;
}

function computed(cfg: ControlFlowGraph, expressions: SubExpr[]): (f: Flow) => bigint {
    const computedMap = new Map<InstrFlow, bigint>();
    for (const f of cfg.all) {
        let flags = 0n;

        for (const [expIdx, expression] of expressions.entries()) {
            if (expression.positions.find(({expr, end}) => expr === f.expr && end === f.instrIndex)) {
                flags |= 1n << BigInt(expIdx);
            }
        }

        computedMap.set(f, flags);
    }
    return (f) => computedMap.get(f as InstrFlow) ?? 0n;
}

function analysis(cfg: ControlFlowGraph, exprs: SubExpr[]) {
    const TRANSP = transparent(cfg, exprs);
    const COMP = computed(cfg, exprs);
    const ANTLOC = COMP; // since this implementation has no basic blocks, ANTLOC = COMP ?

    // Step 1: Compute AVIN/AVOUT and ANTIN/ANTOUT for all nodes.
    const AVIN = new Map<Flow, bigint>(), AVOUT = new Map<Flow, bigint>();
    framework(cfg,
        AVIN,
        AVOUT,
        "forwards",
        "intersection",
        (f, x) => COMP(f) | (x & TRANSP(f))
    );

    const ANTOUT = new Map<Flow, bigint>(), ANTIN = new Map<Flow, bigint>();
    framework(cfg,
        ANTOUT,
        ANTIN,
        "backwards",
        "intersection",
        (f, x) => ANTLOC(f) | (x & TRANSP(f))
    );

    // Step 2: Compute SAFEIN/SAFEOUT for all nodes.
    const SAFEIN = new Map<Flow, bigint>(), SAFEOUT = new Map<Flow, bigint>();
    for (const f of cfg.all) {
        SAFEIN.set(f, (AVIN.get(f) ?? 0n) | (ANTIN.get(f) ?? 0n));
        SAFEOUT.set(f, (AVOUT.get(f) ?? 0n) | (ANTOUT.get(f) ?? 0n));
    }

    // Step 3: Compute SPAVIN/SPAVOUT and SPANTIN/SPANTOUT for all nodes.
    const SPAVIN = new Map<Flow, bigint>(), SPAVOUT = new Map<Flow, bigint>();
    framework(cfg,
        SPAVIN,
        SPAVOUT,
        "forwards",
        "union",
        (f, x) => (COMP(f) | (x & TRANSP(f))) & (SAFEOUT.get(f) ?? 0n),
        (f, x) => x & (SAFEIN.get(f) ?? 0n)
    );

    const SPANTOUT = new Map<Flow, bigint>(), SPANTIN = new Map<Flow, bigint>();
    framework(cfg,
        SPANTOUT,
        SPANTIN,
        "backwards",
        "union",
        (f, x) => (ANTLOC(f) | (x & TRANSP(f))) & (SAFEIN.get(f) ?? 0n),
        (f, x) => x & (SAFEOUT.get(f) ?? 0n)
    );

    // Step 4: Compute points of insertions and replacements INSERT, INSERT(i,j), and REPLACE.
    const INSERT = new Map<Flow, bigint>(), REPLACE = new Map<Flow, bigint>();
    const INSERT_EDGE = new Map<Flow, [Flow, bigint][]>();
    for (const i of [cfg.entry, ...cfg.all]) {
        const comp = COMP(i), spavin = (SPAVIN.get(i) ?? 0n), spantout = (SPANTOUT.get(i) ?? 0n);
        const insert = comp & (~spavin) & spantout;
        if (insert !== 0n) INSERT.set(i, insert);

        const antloc = ANTLOC(i);
        const replace = (antloc & spavin) | (comp & spantout);
        if (replace !== 0n) REPLACE.set(i, replace);

        const spavout = SPAVOUT.get(i) ?? 0n, edgeList = [];
        for (const j of i.flowNext) {
            if (!j.instr) continue;
            const insert_edge = (~spavout) & (SPAVIN.get(j) ?? 0n) & (SPANTIN.get(j) ?? 0n);
            if (insert_edge !== 0n) edgeList.push([j, insert_edge] as [InstrFlow, bigint]);
        }
        if (edgeList.length) INSERT_EDGE.set(i, edgeList);
    }
    return {INSERT, INSERT_EDGE, REPLACE};
}

function processResults(exprs: SubExpr[], {INSERT, INSERT_EDGE, REPLACE}: ReturnType<typeof analysis>): ExprResult[] {
    // convert the results from bits
    const results: ExprResult[] = [];
    for (const exp of exprs) {
        const insertBefore: InstrFlow[] = [];
        for (const [i, bits] of INSERT.entries()) {
            if (bits & exp.bit) {
                if (i.instr) {
                    insertBefore.push(i);
                } else { // i must be entry
                    insertBefore.push(...i.flowNext as Set<InstrFlow>);
                }
            }
        }

        const insertBetween: [InstrFlow, InstrFlow][] = [];
        for (const [i, list] of INSERT_EDGE.entries()) {
            for (const [j, bits] of list) {
                if (bits & exp.bit) {
                    if (i.instr && j.instr) {
                        insertBetween.push([i, j]);
                    } else { // i must be entry
                        insertBefore.push(j as InstrFlow);
                    }
                }
            }
        }

        const replacementFlows: InstrFlow[] = [];
        for (const [i, bits] of REPLACE.entries()) {
            if (bits & exp.bit) replacementFlows.push(i as InstrFlow);
        }

        if (insertBefore.length + insertBetween.length && replacementFlows.length) {
            const local = replacementFlows[0].expr.builder.addLocal(exp.type);
            const insertInstructions = [...exp.instructions, Instructions.local.set(local)];
            const replacementInstructions = [Instructions.local.get(local)];

            results.push({
                expression: exp,
                insertBefore, insertBetween, insertAfter: [],
                insertInstructions,
                replacementFlows,
                replacementInstructions,
                fnLengthChange: 0
            });
        }
    }

    for (const result of results) {
        // minimizing edge insertions
        for (const i of new Set(result.insertBetween.map(([i]) => i))) {
            const check = [...i.flowNext].every(j =>
                j.instr && (result.insertBetween.find(([i2, j2]) => i === i2 && j === j2) || result.insertBefore.includes(j))
            );
            if (check) {
                // remove [i, *j] from edges and [*j] from nodes
                result.insertBetween = result.insertBetween.filter(([i2]) => i !== i2);
                result.insertBefore = result.insertBefore.filter(j2 => !i.flowNext.has(j2));

                if (i.instr.type === "structured") {
                    // the structured nodes appear in the flow graph at the start of their blocks, and the algorithm
                    // wants to insert after that flow graph, NOT after the whole structured instruction.
                    result.insertBefore.push(i);
                    // so instead insert before, which is safe as structured instructions only side effects are jumping
                } else {
                    result.insertAfter.push(i);
                }
            }
        }

        // calculate how this result would change the length of the function
        const inserted = result.insertInstructions.length * ((result.insertBefore.length) + (result.insertBetween.length) + (result.insertAfter.length));
        const removed = (result.expression.instructions.length - result.replacementInstructions.length) * result.replacementFlows.length;
        result.fnLengthChange = inserted - removed;
    }
    return results;
}

function eliminateOverlapping(results: ExprResult[]): void {
    // as expressions(...) returns all subexpressions in functions, need to chose which results to action

    results.sort((a, b) => {
        // prioritize expression replacements which would make the function shorter as these probably replace
        // longer subexpressions which appear more often
        const diff = a.fnLengthChange - b.fnLengthChange;
        if (diff !== 0) return diff;
        // after that prioritize longer subexpressions
        return b.expression.instructions.length - a.expression.instructions.length;
    });

    // filter out expressions we can't do because they overlap with other expressions
    // (hopefully due to the above sorting we will keep the longer expressions and discard their subexpressions)
    const modificationRegions: [expr: WExpression, start: number, end: number][] = [];
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const expressionLen = result.expression.instructions.length;

        const regions = result.replacementFlows.map(f =>
            [f.expr, f.instrIndex - expressionLen, f.instrIndex] as [WExpression, number, number]);

        const overlaps = regions.some(([expr1, min1, max1]) =>
            modificationRegions.some(([expr2, min2, max2]) =>
                expr1 === expr2 && max1 >= min2 && max2 >= min1
            ));

        if (overlaps) { // can't process this result as it overlaps with another with higher score
            results.splice(i, 1);
            i--;
        } else {
            modificationRegions.push(...regions);
        }
    }
}

export function pre(expr: WExpression): void {
    const cfg = controlFlow(expr);
    if (!cfg.all.length) return;
    const exprs = expressions(expr);
    if (!exprs.length) return;

    const {INSERT, INSERT_EDGE, REPLACE} = analysis(cfg, exprs);
    if (INSERT.size === 0 && INSERT_EDGE.size === 0 && REPLACE.size === 0) return;

    const results = processResults(exprs, {INSERT, INSERT_EDGE, REPLACE});
    eliminateOverlapping(results);

    const ifs = new InstrFlowSplicer(); // keeps tracks of edits and adjust indices
    for (const result of results) {
        const exprLength = result.expression.instructions.length;
        for (const i of result.replacementFlows) { // i is the last node of the expression
            ifs.splice(i, exprLength, result.replacementInstructions, 1 - exprLength);
        }

        for (const i of result.insertBefore) {
            ifs.splice(i, 0, result.insertInstructions, 0);
        }
        for (const i of result.insertAfter) {
            if (i.instr.name.startsWith("br")) {
                // just insert before instead
                ifs.splice(i, 0, result.insertInstructions, 0);
            } else {
                ifs.splice(i, 0, result.insertInstructions, 1);
            }
        }

        for (const [i, j] of result.insertBetween) {
            if (i.expr === j.expr && i.instrIndex + 1 === j.instrIndex) {
                // instructions one after each other
                ifs.splice(j, 0, result.insertInstructions);
            } else if (ifs.realIndex(i) + 1 === i.expr.instructions.length) {
                // i at the end of a block
                ifs.splice(i, 0, result.insertInstructions, i.instr.name.startsWith("br") ? 0 : 1);
            } else if (i.instr.name.startsWith("br")) {
                // at a branch
                ifs.splice(i, 0, result.insertInstructions);
            } else {
                throw new Error("Unknown PRE insertion");
            }
        }
    }
}
