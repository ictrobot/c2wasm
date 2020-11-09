import {CFuncDefinition} from "../tree/declarations";
import {CStatement, CReturn, CCompoundStatement} from "../tree/statements";
import {WFunctionBuilder, Instructions} from "../wasm";
import {WExpression} from "../wasm/instructions";
import {WGenerator} from "./generator";

export function statementGeneration(m: WGenerator, s: CStatement, b: WFunctionBuilder): WExpression {
    const instr: WExpression = [];
    if (s instanceof CCompoundStatement) {
        // TODO deal with locals etc
        return s.statements.flatMap(s2 => statementGeneration(m, s2, b));
    } else if (s instanceof CReturn) {
        if (s.value) instr.push(...m.expression(s.value, b));
        if (isNested(s)) instr.push(Instructions.return());
    }

    if (instr.length === 0) throw new Error("TODO");
    return instr;
}

function isNested(s: CStatement) {
    return !(s.parent instanceof CCompoundStatement && s.parent.parent instanceof CFuncDefinition);
}
