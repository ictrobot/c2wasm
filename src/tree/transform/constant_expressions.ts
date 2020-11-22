import {CVarDefinition} from "../declarations";
import {CExpression, CConstant, CIdentifier, CSizeof, CBitwiseNot, CLogicalNot, CCast, CMulDiv, CMod, CAddSub, CShift, CRelational, CEquality, CBitwiseAndOr, CLogicalAndOr, CConditional, CUnaryPlusMinus, CValue, CInitializer} from "../expressions";
import {ExpressionTypeError} from "../type_checking";
import {CArithmetic, CEnum, CSizeT, CPointer} from "../types";

type ExtraFn = (e: CExpression) => CValue;

export function constExpression(e: CExpression, extra?: ExtraFn): CValue {
    if (e instanceof CConstant) {
        return {value: e.value, type: e.type};
    } else if (e instanceof CIdentifier && e.value instanceof CVarDefinition && e.value.type.qualifier === "const" && e.value.staticValue instanceof CConstant) {
        return constExpression(e.value.staticValue, extra);

    } else if (e instanceof CSizeof) {
        return normalizeType({value: e.body.bytes, type: CSizeT});

    } else if (e instanceof CUnaryPlusMinus) {
        const v = constExpression(e.body, extra);
        return e.op === "+" ? v : {value: -v.value, type: e.type};

    } else if (e instanceof CBitwiseNot) {
        const v = constInteger(e.body, extra);
        return normalizeType({value: ~v.value, type: v.type});

    } else if (e instanceof CLogicalNot) {
        const v = constExpression(e.body, extra);
        // eslint-disable-next-line eqeqeq
        return {value: v.value == 0 ? 1n : 0n, type: CArithmetic.S32};

    } else if (e instanceof CCast && (e.type instanceof CArithmetic || e.type instanceof CEnum || e.type instanceof CPointer)) {
        const v = constExpression(e.body, extra);
        return normalizeType({value: v.value, type: e.type});

    } else if (e instanceof CMulDiv) {
        const lhs = constExpression(e.lhs, extra), rhs = constExpression(e.rhs, extra);
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
        const lhs = constInteger(e.lhs, extra), rhs = constInteger(e.rhs, extra);
        return normalizeType({value: lhs.value % rhs.value, type: e.type});

    } else if (e instanceof CAddSub && e.type instanceof CArithmetic) {
        const lhs = constExpression(e.lhs, extra), rhs = constExpression(e.rhs, extra);
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
        const lhs = constInteger(e.lhs, extra), rhs = constInteger(e.rhs, extra);
        if (e.dir === "left") {
            return normalizeType({value: lhs.value << rhs.value, type: e.type});
        }
        return normalizeType({value: lhs.value >> rhs.value, type: e.type});

    } else if (e instanceof CRelational) {
        const lhs = constExpression(e.lhs, extra), rhs = constExpression(e.rhs, extra);
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
        const lhs = constExpression(e.lhs, extra), rhs = constExpression(e.rhs, extra);
        if (e.op === "==") {
            // eslint-disable-next-line eqeqeq
            return {value: lhs.value == rhs.value ? 1n : 0n, type: CArithmetic.S32};
        } else {
            // eslint-disable-next-line eqeqeq
            return {value: lhs.value != rhs.value ? 1n : 0n, type: CArithmetic.S32};
        }

    } else if (e instanceof CBitwiseAndOr) {
        const lhs = constInteger(e.lhs, extra), rhs = constInteger(e.rhs, extra);
        if (e.op === "and") {
            return normalizeType({value: lhs.value & rhs.value, type: e.type});
        } else if (e.op === "or") {
            return normalizeType({value: lhs.value | rhs.value, type: e.type});
        } else {
            return normalizeType({value: lhs.value ^ rhs.value, type: e.type});
        }

    } else if (e instanceof CLogicalAndOr) {
        const lhs = constExpression(e.lhs, extra);
        if (e.op === "and") {
            // eslint-disable-next-line eqeqeq
            if (lhs.value != 0 && constExpression(e.rhs, extra).value != 0) {
                return {value: 1n, type: CArithmetic.S32};
            }
            return {value: 0n, type: CArithmetic.S32};
        } else {
            // eslint-disable-next-line eqeqeq
            if (lhs.value != 0 || constExpression(e.rhs, extra).value != 0) {
                return {value: 1n, type: CArithmetic.S32};
            }
            return {value: 0n, type: CArithmetic.S32};
        }

    } else if (e instanceof CConditional && (e.type instanceof CArithmetic || e.type instanceof CEnum || e.type instanceof CPointer)) {
        const test = constExpression(e.test, extra);
        let value: CValue;
        // eslint-disable-next-line eqeqeq
        if (test.value != 0) {
            value = constExpression(e.trueValue, extra);
        } else {
            value = constExpression(e.falseValue, extra);
        }
        return normalizeType({value: value.value, type: e.type});

    }

    // for adding addressof support etc for static initializers
    if (extra !== undefined) return extra(e);

    throw new ExpressionTypeError(e.node, "constant expression");
}

export function constInteger(e: CExpression, extra?: ExtraFn): CValue & {readonly value: bigint} {
    const v = constExpression(e, extra);
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

export const normalizeValueType = normalizeType;
