import {WExpression, ValueType} from "../../wasm";
import {WLocal} from "../../wasm/functions";
import {WGlobal} from "../../wasm/global";
import {InstrInstance, ReadResource} from "../../wasm/instr_helpers";
import {InstrFlow, controlFlow, ControlFlowGraph} from "./control_flow";
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

                if (stack.length === 1 && (j - i) > 2) {
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

function transparent(cfg: ControlFlowGraph, expressions: SubExpr[]): (f: InstrFlow) => bigint {
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
    return (f) => transpMap.get(f) ?? fullyTransparent;
}

function computed(cfg: ControlFlowGraph, expressions: SubExpr[]): (f: InstrFlow) => bigint {
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
    return (f) => computedMap.get(f) ?? 0n;
}

function analysis(cfg: ControlFlowGraph, exprs: SubExpr[]) {
    const TRANSP = transparent(cfg, exprs);
    const COMP = computed(cfg, exprs);
    const ANTLOC = COMP; // since this implementation has no basic blocks, ANTLOC = COMP ?

    // Step 1: Compute AVIN/AVOUT and ANTIN/ANTOUT for all nodes.
    const AVIN = new Map<InstrFlow, bigint>(), AVOUT = new Map<InstrFlow, bigint>();
    framework(cfg,
        AVIN,
        AVOUT,
        "forwards",
        "intersection",
        (f, x) => COMP(f) | (x & TRANSP(f))
    );

    const ANTOUT = new Map<InstrFlow, bigint>(), ANTIN = new Map<InstrFlow, bigint>();
    framework(cfg,
        ANTOUT,
        ANTIN,
        "backwards",
        "intersection",
        (f, x) => ANTLOC(f) | (x & TRANSP(f))
    );

    // Step 2: Compute SAFEIN/SAFEOUT for all nodes.
    const SAFEIN = new Map<InstrFlow, bigint>(), SAFEOUT = new Map<InstrFlow, bigint>();
    for (const f of cfg.all) {
        SAFEIN.set(f, (AVIN.get(f) ?? 0n) | (ANTIN.get(f) ?? 0n));
        SAFEOUT.set(f, (AVOUT.get(f) ?? 0n) | (ANTOUT.get(f) ?? 0n));
    }

    // Step 3: Compute SPAVIN/SPAVOUT and SPANTIN/SPANTOUT for all nodes.
    const SPAVIN = new Map<InstrFlow, bigint>(), SPAVOUT = new Map<InstrFlow, bigint>();
    framework(cfg,
        SPAVIN,
        SPAVOUT,
        "forwards",
        "union",
        (f, x) => (COMP(f) | (x & TRANSP(f))) & (SAFEOUT.get(f) ?? 0n),
        (f, x) => x & (SAFEIN.get(f) ?? 0n)
    );

    const SPANTOUT = new Map<InstrFlow, bigint>(), SPANTIN = new Map<InstrFlow, bigint>();
    framework(cfg,
        SPANTOUT,
        SPANTIN,
        "backwards",
        "union",
        (f, x) => (ANTLOC(f) | (x & TRANSP(f))) & (SAFEIN.get(f) ?? 0n),
        (f, x) => x & (SAFEOUT.get(f) ?? 0n)
    );

    // Step 4: Compute points of insertions and replacements INSERT, INSERT(i,j), and REPLACE.
    const INSERT = new Map<InstrFlow, bigint>(), REPLACE = new Map<InstrFlow, bigint>();
    const INSERT_EDGE = new Map<InstrFlow, [InstrFlow, bigint][]>();
    for (const i of cfg.all) {
        const comp = COMP(i), spavin = (SPAVIN.get(i) ?? 0n), spantout = (SPANTOUT.get(i) ?? 0n);
        const insert = comp & (~spavin) & spantout;
        if (insert !== 0n) INSERT.set(i, insert);

        const antloc = ANTLOC(i);
        const replace = (antloc & spavin) + (comp & spantout);
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

export function pre(expr: WExpression): void {
    const cfg = controlFlow(expr);
    if (!cfg.all.length) return;
    const exprs = expressions(expr);
    if (!exprs.length) return;

    const {INSERT, INSERT_EDGE, REPLACE} = analysis(cfg, exprs);
    if (INSERT.size === 0 && INSERT_EDGE.size === 0 && REPLACE.size === 0) return;

    console.log(INSERT, INSERT_EDGE, REPLACE);
}
