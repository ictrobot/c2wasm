import {CExpression, CConstant} from "../ir/expressions";
import {Scope} from "../ir/scope";
import {CArithmetic} from "../ir/types";
import {ParseNode} from "../parsing/parsetree";
import * as pt from "../parsing/parsetree";

const tempFakeConstant = new CConstant(new class extends ParseNode {
    readonly type = "fake";
}({first_line: 0, first_column: 0, last_line: 0, last_column: 0}), CArithmetic.S32, 36n);

export function ptExpression(e: pt.Expression, scope: Scope): CExpression {
    // TODO
    return tempFakeConstant;
}

export function evalConstant(c: pt.ConstantExpression): CConstant {
    // TODO
    return tempFakeConstant;
}
