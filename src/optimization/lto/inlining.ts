import {ModuleBuilder, WFunction, WExpression, Instructions} from "../../wasm";
import type {funcidx} from "../../wasm/base_types";
import {remapLocals} from "../flow/local_allocation";
import {optimize} from "../index";
import {peephole} from "../peephole";
import {InstrSplicer} from "../splicer";

export function inlineFunctions(module: ModuleBuilder): void {
    const map = new Map<WFunction, FnInfo>();
    for (const fn of module.functions) map.set(fn, new FnInfo(fn, map));
    for (const info of map.values()) info.analyze();

    const modifiedFns = new Set<WFunction>();

    const splicer = new InstrSplicer();
    for (const info of map.values()) {
        for (const usage of info.inliningCandidates()) {
            const argTypes = info.fn.type[0];
            const newLocals = [...argTypes, ...info.fn.locals].map(x => usage.expr.builder.addLocal(x));
            const returnType = info.fn.type[1][0] ?? null;

            // create the structure for the inlining
            const replacement = [];
            for (let i = argTypes.length - 1; i >= 0; i--) {
                replacement.push(Instructions.local.set(newLocals[i]));
            }
            replacement.push(Instructions.block(returnType, []));
            splicer.splice(usage, 1, replacement);

            const blockIndex = splicer.realIndex(usage) + argTypes.length;
            const block = usage.expr.instructions[blockIndex];
            if (!block || block.type !== "structured" || block.immediate.expression.instructions.length !== 0) {
                throw new Error("Failed to inline function");
            }

            // actually copy the function and modify as needed
            info.fn.body.copyInto(block.immediate.expression);
            remapLocals(block.immediate.expression, newLocals);
            peephole(block.immediate.expression, ([instr], depth) => {
                if (instr.name === "return") {
                    // replace returns with br to the encapsulating block
                    return [returnType ? Instructions.br(depth, returnType) : Instructions.br(depth)];
                }
            }, 1);

            modifiedFns.add(usage.fn);
            info.usages = info.usages.filter(x => x !== usage);
        }

        if (info.usages.length === 0 && !info.inTable && !info.exported) {
            // TODO remove fn
        }
    }

    for (const fn of modifiedFns) { // clean up any modified functions
        optimize(fn.body);
    }

    // TODO remove now unused functions
    // FIXME nested inlining?
}

type Usage = {fn: WFunction, fnInfo: FnInfo, expr: WExpression, instrIndex: number};

class FnInfo {
    usages: Usage[] = [];
    size: number = 0;

    inTable: boolean;
    exported: boolean;

    constructor(readonly fn: WFunction, private readonly fnMap: Map<WFunction, FnInfo>) {
        this.inTable = fn.parent._inFunctionTable(fn);
        this.exported = fn.exportName !== undefined;
    }

    analyze() {
        if (this.size > 0) return;

        const exprQueue = [this.fn.body];
        let expr;
        while ((expr = exprQueue.shift()) !== undefined) {
            this.size += expr.instructions.length;
            for (const [i, instr] of expr.instructions.entries()) {
                if (instr.type === "structured") {
                    exprQueue.push(instr.immediate.expression);
                    if (instr.immediate.expression2) exprQueue.push(instr.immediate.expression2);
                } else if (instr.type === "index" && instr.name === "call") {
                    const target = this.fn.parent._functionLookup(instr.immediate.value as funcidx);
                    const fnInfo = this.fnMap.get(target as WFunction);
                    if (fnInfo) fnInfo.usages.push({fn: this.fn, fnInfo, expr, instrIndex: i});
                }
            }
        }
    }

    inliningCandidates(): Usage[] {
        if (this.size > 50 || this.usages.length === 0) return []; // never inline

        let score = this.size;
        score += Math.min(this.fn.body.builder.args.length - 1, 0) * 5; // one argument is okay
        score += this.fn.locals.length * 5;
        if (this.fn.hints.inline) score -= 20;

        if (score <= 8 || (score <= 16 && this.usages.length <= 3 && !this.inTable && !this.exported)) {
            // inline all (non-recursive) cases
            return this.usages.filter(({fn}) => fn !== this.fn);
        }
        return [];
    }
}
