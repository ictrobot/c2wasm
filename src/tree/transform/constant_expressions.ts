import {CVarDefinition} from "../declarations";
import {CExpression, CConstant, CIdentifier, CSizeof, CBitwiseNot, CLogicalNot, CCast, CMulDiv, CMod, CAddSub, CShift, CRelational, CEquality, CBitwiseAndOr, CLogicalAndOr, CConditional, CUnaryPlusMinus, CValue} from "../expressions";
import {Scope} from "../scope";
import {ExpressionTypeError} from "../type_checking";
import {CArithmetic, CEnum, CSizeT, CPointer} from "../types";

export function constExpression(e: CExpression, scope: Scope): CValue {
    if (e instanceof CConstant) {
        return {value: e.value, type: e.type};
    } else if (e instanceof CIdentifier && e.value instanceof CVarDefinition && e.value.type.qualifier === "const" && e.value.staticValue instanceof CConstant) {
        return constExpression(e.value.staticValue, scope);

    } else if (e instanceof CSizeof) {
        return normalizeType({value: e.body.bytes, type: CSizeT});

    } else if (e instanceof CUnaryPlusMinus) {
        const v = constExpression(e.body, scope);
        return e.op === "+" ? v : {value: -v.value, type: e.type};

    } else if (e instanceof CBitwiseNot) {
        const v = constInteger(e, scope);
        return normalizeType({value: ~v.value, type: v.type});

    } else if (e instanceof CLogicalNot) {
        const v = constExpression(e, scope);
        // eslint-disable-next-line eqeqeq
        return {value: v.value == 0 ? 1n : 0n, type: CArithmetic.S32};

    } else if (e instanceof CCast && (e.type instanceof CArithmetic || e.type instanceof CEnum || e.type instanceof CPointer)) {
        const v = constExpression(e, scope);
        return {value: v.value, type: e.type};

    } else if (e instanceof CMulDiv) {
        const lhs = constExpression(e.lhs, scope), rhs = constExpression(e.rhs, scope);
        if (e.op === "*") {
            if (e.type.type === "float") {
                return {value: Number(lhs.value) * Number(rhs.value), type: e.type};
            }
            return normalizeType({value: BigInt(lhs.value) * BigInt(rhs.value), type: e.type});
        } else {
            if (e.type.type === "float") {
                return {value: Number(lhs.value) / Number(rhs.value), type: e.type};
            }
            return normalizeType({value: BigInt(lhs.value) / BigInt(rhs.value), type: e.type});
        }

    } else if (e instanceof CMod) {
        const lhs = constInteger(e.lhs, scope), rhs = constInteger(e.rhs, scope);
        return normalizeType({value: lhs.value % rhs.value, type: e.type});

    } else if (e instanceof CAddSub && e.type instanceof CArithmetic) {
        const lhs = constExpression(e.lhs, scope), rhs = constExpression(e.rhs, scope);
        if (e.op === "+") {
            if (e.type.type === "float") {
                return {value: Number(lhs.value) + Number(rhs.value), type: e.type};
            }
            return normalizeType({value: BigInt(lhs.value) + BigInt(rhs.value), type: e.type});
        } else {
            if (e.type.type === "float") {
                return {value: Number(lhs.value) - Number(rhs.value), type: e.type};
            }
            return normalizeType({value: BigInt(lhs.value) - BigInt(rhs.value), type: e.type});
        }

    } else if (e instanceof CShift) {
        const lhs = constInteger(e.lhs, scope), rhs = constInteger(e.rhs, scope);
        if (e.dir === "left") {
            return normalizeType({value: lhs.value << rhs.value, type: e.type});
        }
        return normalizeType({value: lhs.value >> rhs.value, type: e.type});

    } else if (e instanceof CRelational) {
        const lhs = constExpression(e.lhs, scope), rhs = constExpression(e.rhs, scope);
        if (e.op === "LT") {
            return {value: lhs.value < rhs.value ? 1n : 0n, type: CArithmetic.S32};
        } else if (e.op === "GT") {
            return {value: lhs.value > rhs.value ? 1n : 0n, type: CArithmetic.S32};
        } else if (e.op === "LEq") {
            return {value: lhs.value <= rhs.value ? 1n : 0n, type: CArithmetic.S32};
        } else {
            return {value: lhs.value >= rhs.value ? 1n : 0n, type: CArithmetic.S32};
        }

    } else if (e instanceof CEquality) {
        const lhs = constExpression(e.lhs, scope), rhs = constExpression(e.rhs, scope);
        if (e.op === "==") {
            // eslint-disable-next-line eqeqeq
            return {value: lhs.value == rhs.value ? 1n : 0n, type: CArithmetic.S32};
        } else {
            // eslint-disable-next-line eqeqeq
            return {value: lhs.value != rhs.value ? 1n : 0n, type: CArithmetic.S32};
        }

    } else if (e instanceof CBitwiseAndOr) {
        const lhs = constInteger(e.lhs, scope), rhs = constInteger(e.rhs, scope);
        if (e.op === "and") {
            return normalizeType({value: lhs.value & rhs.value, type: e.type});
        } else if (e.op === "or") {
            return normalizeType({value: lhs.value | rhs.value, type: e.type});
        } else {
            return normalizeType({value: lhs.value ^ rhs.value, type: e.type});
        }

    } else if (e instanceof CLogicalAndOr) {
        const lhs = constExpression(e.lhs, scope);
        if (e.op === "and") {
            // eslint-disable-next-line eqeqeq
            if (lhs.value != 0 && constExpression(e.rhs, scope).value != 0) {
                return {value: 1n, type: CArithmetic.S32};
            }
            return {value: 0n, type: CArithmetic.S32};
        } else {
            // eslint-disable-next-line eqeqeq
            if (lhs.value != 0 || constExpression(e.rhs, scope).value != 0) {
                return {value: 1n, type: CArithmetic.S32};
            }
            return {value: 0n, type: CArithmetic.S32};
        }

    } else if (e instanceof CConditional && (e.type instanceof CArithmetic || e.type instanceof CEnum || e.type instanceof CPointer)) {
        const test = constExpression(e.test, scope);
        let value: CValue;
        // eslint-disable-next-line eqeqeq
        if (test.value != 0) {
            value = constExpression(e.trueValue, scope);
        } else {
            value = constExpression(e.falseValue, scope);
        }
        return normalizeType({value: value.value, type: e.type});

    }

    throw new ExpressionTypeError(e.node, "constant expression", e.type.typeName);
}

export function constInteger(e: CExpression, scope: Scope): CValue & {readonly value: bigint} {
    const v = constExpression(e, scope);
    if (v.type instanceof CArithmetic && v.type.type !== "float") return {value: BigInt(v.value), type: v.type};
    throw new ExpressionTypeError(e.node, "expected constant integer expression");
}

function normalizeType(v: CValue): CValue {
    if (v.type instanceof CArithmetic) {
        if (CArithmetic.BOOL.equals(v)) {
            // eslint-disable-next-line eqeqeq
            return {value: v.value == 0 ? 0n : 1n, type: CArithmetic.BOOL};
        } else if (v.type.type === "float") {
            return {value: typeof v.value === "number" ? v.value : Number(v.value), type: v.type};
        } else {
            let value = typeof v.value === "bigint" ? v.value : BigInt(Math.trunc(v.value));

            // ensure fits in type
            const max = BigInt(v.type.maxValue);
            if (v.type.type === "unsigned") {
                while (value < 0) value += max;
            }
            value %= max;
            return {value, type: v.type};
        }
    } else if (v.type instanceof CPointer) {
        // normalize as if U32
        const value = normalizeType({value: v.value, type: CArithmetic.U32}).value;
        return {value: value, type: v.type};
    }
    return v;
}
