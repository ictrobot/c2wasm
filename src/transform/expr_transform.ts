import {CExpression, CConstant, CEvaluable, CIdentifier, CFunctionCall, CMemberAccess, CDereference, CConditional, CAssignment, CStringLiteral} from "../ir/expressions";
import {Scope} from "../ir/scope";
import {CArithmetic} from "../ir/types";
import {ParseNode} from "../parsing/parsetree";
import * as pt from "../parsing/parsetree";
import {ParseTreeValidationError} from "../parsing/validation";

const tempFakeConstant = new CConstant(new class extends ParseNode {
    readonly type = "fake";
}({first_line: 0, first_column: 0, last_line: 0, last_column: 0}), CArithmetic.S32, 36n);

export function ptExpression(e: pt.Expression, scope: Scope): CExpression {
    if (e instanceof pt.ConstantExpression) {
        return ptExpression(e.expr, scope);

    } else if (e instanceof pt.Constant) {
        return ptConstant(e);

    } else if (e instanceof pt.Identifier) {
        return new CIdentifier(e, scope.lookupIdentifier(e.name));

    } else if (e instanceof pt.StringLiteral) {
        const arr: BigInt[] = [];
        for (const char of e.value) {
            const codePoint = unescapeChar(char).codePointAt(0);
            if (codePoint) arr.push(BigInt(codePoint));
        }
        arr.push(0n); // null terminator
        return new CStringLiteral(e, arr);

    } else if (e instanceof pt.UnaryExpression) {
        return ptUnary(e, scope);

    } else if (e instanceof pt.BinaryExpression) {
        return ptBinary(e, scope);

    } else if (e instanceof pt.FunctionCallExpression) {
        return new CFunctionCall(e, ptExpression(e.fn, scope), (e.args ?? []).map(e => ptExpression(e, scope)));

    } else if (e instanceof pt.MemberAccessExpression) {
        let body = ptExpression(e.lhs, scope);
        if (e.pointer) { // transform pointer access
            body = new CDereference(e, body);
        }
        return new CMemberAccess(e, body, e.rhs);

    } else if (e instanceof pt.ConditionalExpression) {
        return new CConditional(e, ptExpression(e.condition, scope), ptExpression(e.trueValue, scope), ptExpression(e.falseValue, scope));

    } else if (e instanceof pt.AssignmentExpression) {
        return new CAssignment(e, ptExpression(e.lhs, scope), ptExpression(e.rhs, scope));

    }

    throw new ParseTreeValidationError(e, "Invalid expression");
}

export function evalConstant(c: pt.ConstantExpression): CConstant {
    const expr = ptExpression(c.expr, new Scope());
    if (expr instanceof CEvaluable) {
        // TODO implement on more expressions
        return expr.evaluate();
    }
    throw new ParseTreeValidationError(c, "Invalid constant expression");
}

function ptUnary(e: pt.UnaryExpression, scope: Scope): CExpression {
    return tempFakeConstant;
}

function ptBinary(e: pt.BinaryExpression, scope: Scope): CExpression {
    return tempFakeConstant;
}

function ptConstant(e: pt.Constant): CConstant {
    let value = e.value;
    let type: CArithmetic;
    if (e.valueType === "int" || e.valueType === "oct" || e.valueType === "hex") {
        let unsigned = false, long = false;
        value = value.toLowerCase();
        if (value.endsWith("u")) {
            value = value.slice(0, -1);
            unsigned = true;
        }
        if (value.endsWith("l")) {
            value = value.slice(0, -1);
            long = true;
        }
        if (!unsigned && value.endsWith("u")) {
            // check u again as u and l can appear in either order
            value = value.slice(0, -1);
            unsigned = true;
        }
        const num = BigInt(value);

        let possibleTypes;
        if (e.valueType === "int" && !unsigned && !long) {
            possibleTypes = [CArithmetic.S32, CArithmetic.S64, CArithmetic.U64];
        } else if (e.valueType !== "int" && !unsigned && !long) {
            possibleTypes = [CArithmetic.S32, CArithmetic.U32, CArithmetic.S64, CArithmetic.U64];
        } else if (unsigned && long) {
            possibleTypes = [CArithmetic.U64];
        } else if (long) {
            possibleTypes = [CArithmetic.S64, CArithmetic.U64];
        } else { // if (unsigned)
            possibleTypes = [CArithmetic.U32, CArithmetic.U64];
        }

        // find smallest type which fits value
        for (const type of possibleTypes) {
            if (num >= type.minValue && num <= type.maxValue) {
                return new CConstant(e, type, num);
            }
        }
        throw new ParseTreeValidationError(e, "Integer constant too large for its type");
    } else if (e.valueType === "float") {
        if (value.endsWith("f")) {
            value = value.slice(0, -1);
            type = CArithmetic.Fp32;
        } else {
            type = CArithmetic.Fp64;
        }
        return new CConstant(e, type, parseFloat(value));
    } else if (e.valueType === "char") {
        value = unescapeChar(value, e);
        return new CConstant(e, CArithmetic.U8, BigInt(value.codePointAt(0)));
    }

    throw new ParseTreeValidationError(e, "Invalid constant type?");
}

function unescapeChar(s: string, node?: ParseNode): string {
    if (s.startsWith("\\")) {
        if (s === "\\n") return "\n";
        if (s === "\\t") return "\t";
        if (s === "\\v") return "\v";
        if (s === "\\b") return "\b";
        if (s === "\\r") return "\r";
        if (s === "\\f") return "\f";
        if (s === "\\a") return "\x07";
        if (s === "\\\\") return "\\";
        if (s === "\\?") return "?";
        if (s === "\\'") return "'";
        if (s === '\\"') return '"';

        let value = NaN;
        if (s.startsWith("\\x")) {
            // hex constant
            value = parseInt(s.slice(2), 16);
        } else {
            // octal constant
            value = parseInt(s.slice(1), 8);
        }

        if (!isNaN(value) && value >= 0 && value <= 255) {
            return String.fromCharCode(value);
        }
        throw new ParseTreeValidationError(node, "Invalid character escape");
    }

    const codePoint = s.codePointAt(0);
    if (s.length !== 1 || codePoint === undefined || codePoint > 255) {
        throw new ParseTreeValidationError(node, "Invalid character");
    }
    return s;
}
