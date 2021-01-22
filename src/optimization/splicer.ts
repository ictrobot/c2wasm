import {WExpression} from "../wasm";
import {PartialInstr, InstrInstance} from "../wasm/instr_helpers";

// subset of InstrFlow, also used by fn inlining
interface InstrLoc {
    expr: WExpression;
    instrIndex: number;
}

// keeps track of edits and offsets the precomputed indices on instr flows accordingly
export class InstrSplicer {
    private offsetsMap = new Map<WExpression, { index: number, offset: number }[]>();

    splice(loc: InstrLoc, deleteCount: number, replacements: (PartialInstr | InstrInstance)[], beginOffset?: number): void {
        let offsets = this.offsetsMap.get(loc.expr);
        if (!offsets) this.offsetsMap.set(loc.expr, offsets = []);

        let instrIndex = loc.instrIndex + (beginOffset ?? 0);
        for (const {index, offset} of offsets) {
            if (instrIndex > index) instrIndex += offset;
        }

        loc.expr.replace(instrIndex, instrIndex + deleteCount, ...replacements);

        const offset = replacements.length - deleteCount;
        if (offset) offsets.push({index: instrIndex, offset});
    }

    realIndex(flow: InstrLoc): number {
        const offsets = this.offsetsMap.get(flow.expr);
        if (!offsets) return flow.instrIndex;

        let instrIndex = flow.instrIndex;
        for (const {index, offset} of offsets) {
            if (instrIndex > index) instrIndex += offset;
        }
        return instrIndex;
    }
}
