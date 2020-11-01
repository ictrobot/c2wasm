import {ParseNode, ParseTreeValidationError, pt} from "../../parsing";
import {CExpression, CConstant, CEvaluable, CIdentifier, CFunctionCall, CMemberAccess, CDereference, CConditional,
    CAssignment, CStringLiteral, CIncrDecr, CAddressOf, CUnaryPlusMinus, CBitwiseNot, CLogicalNot, CSizeof, CAddSub,
    CCast, CComma, CMulDiv, CMod, CShift, CRelational, CEquality, CBitwiseAndOr, CLogicalAndOr} from "../expressions";
import {Scope} from "../scope";
import {CArithmetic} from "../types";
import {getType} from "./type_transform";

export function ptExpression(e: pt.Expression, scope: Scope): CExpression {
    if (e instanceof pt.ConstantExpression) {
        return ptExpression(e.expr, scope);

    } else if (e instanceof pt.Constant) {
        return ptConstant(e);

    } else if (e instanceof pt.Identifier) {
        return new CIdentifier(e, scope.lookupIdentifier(e.name));

    } else if (e instanceof pt.StringLiteral) {
        const arr: BigInt[] = [];
        const charRegex = /[^\\\n"]|\\(?:[^x0-7\n]|x[0-9a-fA-F]{1,2}|[0-7]{1,3})/y;
        while (charRegex.lastIndex < e.value.length) {
            const match = charRegex.exec(e.value);
            if (match && charRegex.lastIndex !== 0) {
                arr.push(BigInt(unescapeChar(match[0], e).codePointAt(0) ?? 0));
            } else {
                throw new ParseTreeValidationError(e, "Invalid string literal");
            }
        }
        arr.push(0n); // null terminator
        return new CStringLiteral(e, arr);

    } else if (e instanceof pt.UnaryExpression) {
        return ptUnary(e, scope);

    } else if (e instanceof pt.BinaryExpression) {
        return ptBinary(e, scope);

    } else if (e instanceof pt.SizeofExpression) {
        if (e.body instanceof pt.Expression) { // sizeof [expression]
            return new CSizeof(e, ptExpression(e.body, scope).type);
        } else { // sizeof [type]
            return new CSizeof(e, getType(e.body, scope));
        }

    } else if (e instanceof pt.CastExpression) {
        return new CCast(e, getType(e.targetType, scope), ptExpression(e.body, scope));

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
        // TODO implement CEvaluable on more types of expressions
        return expr.evaluate();
    }
    throw new ParseTreeValidationError(c, "Invalid constant expression");
}

function ptUnary(e: pt.UnaryExpression, scope: Scope): CExpression {
    const body = ptExpression(e.body, scope);
    if (e.type === "prefixIncrement") return new CIncrDecr(e, body, "++", "pre");
    if (e.type === "prefixDecrement") return new CIncrDecr(e, body, "--", "pre");
    if (e.type === "postfixIncrement") return new CIncrDecr(e, body, "++", "post");
    if (e.type === "postfixDecrement") return new CIncrDecr(e, body, "--", "post");
    if (e.type === "addressOf") return new CAddressOf(e, body);
    if (e.type === "dereference") return new CDereference(e, body);
    if (e.type === "unaryPlus") return new CUnaryPlusMinus(e, body, "+");
    if (e.type === "unaryMinus") return new CUnaryPlusMinus(e, body, "-");
    if (e.type === "bitwiseNot") return new CBitwiseNot(e, body);
    if (e.type === "logicalNot") return new CLogicalNot(e, body);

    throw new ParseTreeValidationError(e, "Invalid unary expression");
}

function ptBinary(e: pt.BinaryExpression, scope: Scope): CExpression {
    const lhs = ptExpression(e.lhs, scope), rhs = ptExpression(e.rhs, scope);

    if (e.type === "mul") return new CMulDiv(e, lhs, rhs, "*");
    if (e.type === "div") return new CMulDiv(e, lhs, rhs, "/");
    if (e.type === "mod") return new CMod(e, lhs, rhs);
    if (e.type === "add") return new CAddSub(e, lhs, rhs, "+");
    if (e.type === "sub") return new CAddSub(e, lhs, rhs, "-");
    if (e.type === "bitwiseShiftLeft") return new CShift(e, lhs, rhs, "left");
    if (e.type === "bitwiseShiftRight") return new CShift(e, lhs, rhs, "right");

    if (e.type === "relationalLT") return new CRelational(e, lhs, rhs, "LT");
    if (e.type === "relationalGT") return new CRelational(e, lhs, rhs, "GT");
    if (e.type === "relationalLEq") return new CRelational(e, lhs, rhs, "LEq");
    if (e.type === "relationalGEq") return new CRelational(e, lhs, rhs, "GEq");
    if (e.type === "relationalEq") return new CEquality(e, lhs, rhs, "==");
    if (e.type === "relationalNEq") return new CEquality(e, lhs, rhs, "!=");

    if (e.type === "bitwiseAnd") return new CBitwiseAndOr(e, lhs, rhs, "and");
    if (e.type === "bitwiseXor") return new CBitwiseAndOr(e, lhs, rhs, "xor");
    if (e.type === "bitwiseOr") return new CBitwiseAndOr(e, lhs, rhs, "or");
    if (e.type === "logicalAnd") return new CLogicalAndOr(e, lhs, rhs, "and");
    if (e.type === "logicalOr") return new CLogicalAndOr(e, lhs, rhs, "or");

    if (e.type === "comma") return new CComma(e, lhs, rhs);
    if (e.type === "arraySubscript") {
        // transform `a[b]` into `*(a+b)`
        return new CDereference(e, new CAddSub(e, ptExpression(e.lhs, scope), ptExpression(e.rhs, scope), "+"));
    }

    throw new ParseTreeValidationError(e, "Invalid binary expression");
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

        let value: number;
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
