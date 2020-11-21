import {ParseNode, ParseTreeValidationError, pt} from "../../parsing";
import {CFuncDefinition, CFuncDeclaration} from "../declarations";
import {
    CExpression, CConstant, CEvaluable, CIdentifier, CFunctionCall, CMemberAccess, CDereference, CConditional,
    CAssignment, CStringLiteral, CIncrDecr, CAddressOf, CUnaryPlusMinus, CBitwiseNot, CLogicalNot, CSizeof, CAddSub,
    CCast, CComma, CMulDiv, CMod, CShift, CRelational, CEquality, CBitwiseAndOr, CLogicalAndOr, CArrayPointer
} from "../expressions";
import {Scope} from "../scope";
import {CArithmetic, CArray} from "../types";
import {getType} from "./type_transform";

/** Transform expressions from the parse tree */
export function ptExpression(e: pt.Expression, scope: Scope): CExpression {
    if (e instanceof pt.ConstantExpression) {
        // pt.ConstantExpression is a wrapped class in the parse tree denoting where constant expressions are expected.
        return ptExpression(e.expr, scope);

    } else if (e instanceof pt.Constant) {
        return ptConstant(e);

    } else if (e instanceof pt.Identifier) {
        const id = new CIdentifier(e, scope.lookupIdentifier(e.name, e));
        if (id.type instanceof CArray) {
            return new CArrayPointer(e, id);
        } else if (id.value instanceof CFuncDefinition || id.value instanceof CFuncDeclaration) {
            // add function as dependency for current function
            if (!scope.func) throw new ParseTreeValidationError(id.node, "Function referenced outside function?");
            scope.func.dependencies.set(id.value, true);
        }
        return id;

    } else if (e instanceof pt.StringLiteral) {
        const arr: bigint[] = []; // split the literal into characters taking into account escape sequences
        const charRegex = /[^\\\n"]|\\(?:[^x0-7\n]|x[0-9a-fA-F]{1,2}|[0-7]{1,3})/y;
        while (charRegex.lastIndex < e.value.length) {
            const match = charRegex.exec(e.value);
            if (match && charRegex.lastIndex !== 0) {
                arr.push(BigInt(unescapeChar(match[0], e).codePointAt(0) ?? 0)); // unescape the char if needed
            } else {
                // regex didn't match the body for some reason, this shouldn't happen
                throw new ParseTreeValidationError(e, "Invalid string literal");
            }
        }
        arr.push(0n); // null terminator
        return new CArrayPointer(e, new CStringLiteral(e, arr));

    } else if (e instanceof pt.UnaryExpression) {
        return ptUnary(e, scope);

    } else if (e instanceof pt.BinaryExpression) {
        return ptBinary(e, scope);

    } else if (e instanceof pt.SizeofExpression) {
        if (e.body instanceof pt.Expression) { // sizeof [expression]
            let bodyExpr = ptExpression(e.body, scope);
            if (bodyExpr instanceof CArrayPointer) bodyExpr = bodyExpr.arrayIdentifier;
            return new CSizeof(e, bodyExpr.type);
        } else { // sizeof [type]
            return new CSizeof(e, getType(e.body, scope));
        }

    } else if (e instanceof pt.CastExpression) {
        return new CCast(e, getType(e.targetType, scope), ptExpression(e.body, scope));

    } else if (e instanceof pt.FunctionCallExpression) {
        return new CFunctionCall(e, ptExpression(e.fn, scope), (e.args ?? []).map(e => ptExpression(e, scope)));

    } else if (e instanceof pt.MemberAccessExpression) {
        let body = ptExpression(e.lhs, scope);
        if (!e.pointer) { // transform into pointer access
            body = new CAddressOf(e, body);
        }
        return new CMemberAccess(e, body, e.rhs);

    } else if (e instanceof pt.ConditionalExpression) {
        return new CConditional(e, ptExpression(e.condition, scope), ptExpression(e.trueValue, scope), ptExpression(e.falseValue, scope));

    } else if (e instanceof pt.AssignmentExpression) {
        return new CAssignment(e, ptExpression(e.lhs, scope), ptExpression(e.rhs, scope), e.assignType);

    }

    throw new ParseTreeValidationError(e, "Invalid expression");
}

/** Evaluate an expression at compile time to a constant */
export function evalConstant(c: pt.ConstantExpression): CConstant {
    const expr = ptExpression(c.expr, new Scope());
    if (expr instanceof CEvaluable) {
        // TODO implement CEvaluable on more types of expressions
        const v = expr.evaluate();
        if (v !== undefined) return v;
    }
    throw new ParseTreeValidationError(c, "Invalid constant expression");
}

function ptUnary(e: pt.UnaryExpression, scope: Scope): CExpression {
    // transform unary expressions
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
    // transform binary expressions
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

/** Transform a constant
 *
 * This is quite complicated because we have to work out what type to give the constant, following the rules set out in
 * the standard
 */
export function ptConstant(e: pt.Constant): CConstant {
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
            // may be a second l for long long
            if (value.endsWith("l")) value = value.slice(0, -1);
        }
        if (!unsigned && value.endsWith("u")) {
            // check u again as u and l can appear in either order
            value = value.slice(0, -1);
            unsigned = true;
        }

        let num: bigint; // all integer constants are stored as BigInt
        if (e.valueType !== "oct") {
            // BigInt constructor natively handles decimal values and hexadecimal values prefixed with 0x
            num = BigInt(value);
        } else {
            // Have to manually construct octal constants
            num = 0n;
            for (let i = 0; i < value.length - 1; i++) { // ignore the leading 0
                num += BigInt(value[value.length - 1 - i]) * (8n ** BigInt(i));
            }
        }

        // Choose the list of possible types from the suffixes and the constant type used (decimal, hex, octal)
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

        // find smallest acceptable type which fits the value
        for (const type of possibleTypes) {
            if (num >= type.minValue && num <= type.maxValue) {
                return new CConstant(e, type, num);
            }
        }
        throw new ParseTreeValidationError(e, "Integer constant too large for its type");

    } else if (e.valueType === "float") {
        // floats default to double unless suffixed with "f"
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

/** Unescape strings as defined in the C standard */
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
