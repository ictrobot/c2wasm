import {CVarDefinition} from "../declarations";
import {CExpression, CConstant, CIdentifier, CSizeof, CBitwiseNot, CLogicalNot, CCast, CMulDiv, CMod, CAddSub, CShift, CRelational, CEquality, CBitwiseAndOr, CLogicalAndOr, CConditional, CUnaryPlusMinus, CValue, CInitializer} from "../expressions";
import {ExpressionTypeError} from "../type_checking";
import {CArithmetic, CSizeT, CPointer} from "../types";

type ExtraFn = (e: CExpression, evalExpr: (e: CExpression) => CValue | undefined, fail: (e: CExpression) => undefined) => CValue | undefined;

const CONSTANT = Symbol("constant");

export function constExpression(e: CExpression, extra?: ExtraFn): CValue {
    const v = evalExpression(e, extra);
    if (v) return v;
    throw new ExpressionTypeError(e.node, "constant expression");
}

export function constInteger(e: CExpression, extra?: ExtraFn): CValue & {readonly value: bigint} {
    const v = evalInteger(e, extra);
    if (v) return v;
    throw new ExpressionTypeError(e.node, "constant integer expression");
}

function fail(e: CExpression): undefined {
    (e as object as {[CONSTANT]: boolean})[CONSTANT] = false;
    return undefined;
}

export function evalExpression(e: CExpression, extra?: ExtraFn): CValue | undefined {
    if (!((e as object as { [CONSTANT]: boolean })[CONSTANT] ?? true)) {
        return undefined; // cache on expr if failed previously to speed up flags.generation_try_constant_expr
    } else if (e instanceof CConstant) {
        return {value: e.value, type: e.type};
    } else if (e instanceof CIdentifier && e.value instanceof CVarDefinition && e.value.type.qualifier === "const" && e.value.staticValue instanceof CConstant) {
        return evalExpression(e.value.staticValue, extra);

    } else if (e instanceof CSizeof) {
        return normalizeType({value: e.body.bytes, type: CSizeT});

    } else if (e instanceof CUnaryPlusMinus) {
        const v = evalExpression(e.body, extra);
        if (!v) return fail(e);
        return e.op === "+" ? v : {value: -v.value, type: e.type};

    } else if (e instanceof CBitwiseNot) {
        const v = evalInteger(e.body, extra);
        if (!v) return fail(e);
        return normalizeType({value: ~v.value, type: v.type});

    } else if (e instanceof CLogicalNot) {
        const v = evalExpression(e.body, extra);
        if (!v) return fail(e);
        // eslint-disable-next-line eqeqeq
        return {value: v.value == 0 ? 1n : 0n, type: CArithmetic.S32};

    } else if (e instanceof CCast && (e.type instanceof CArithmetic || e.type instanceof CPointer)) {
        const v = evalExpression(e.body, extra);
        if (!v) return fail(e);
        return normalizeType({value: v.value, type: e.type});

    } else if (e instanceof CMulDiv) {
        const lhs = evalExpression(e.lhs, extra), rhs = evalExpression(e.rhs, extra);
        if (!lhs || !rhs) return fail(e);
        if (e.op === "*") {
            if (e.type.type === "float") {
                return {value: Number(lhs.value) * Number(rhs.value), type: e.type};
            }
            return normalizeType({value: BigInt(lhs.value) * BigInt(rhs.value), type: e.type});

            // eslint-disable-next-line eqeqeq
        } else if (rhs.value != 0) {
            if (e.type.type === "float") {
                return {value: Number(lhs.value) / Number(rhs.value), type: e.type};
            }
            return normalizeType({value: BigInt(lhs.value) / BigInt(rhs.value), type: e.type});
        }

    } else if (e instanceof CMod) {
        const lhs = evalInteger(e.lhs, extra), rhs = evalInteger(e.rhs, extra);
        if (!lhs || !rhs || rhs.value === 0n) return fail(e);
        return normalizeType({value: lhs.value % rhs.value, type: e.type});

    } else if (e instanceof CAddSub && e.type instanceof CArithmetic) {
        const lhs = evalExpression(e.lhs, extra), rhs = evalExpression(e.rhs, extra);
        if (!lhs || !rhs) return fail(e);
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
        const lhs = evalInteger(e.lhs, extra), rhs = evalInteger(e.rhs, extra);
        if (!lhs || !rhs) return fail(e);
        if (e.dir === "left") {
            return normalizeType({value: lhs.value << rhs.value, type: e.type});
        }
        return normalizeType({value: lhs.value >> rhs.value, type: e.type});

    } else if (e instanceof CRelational) {
        const lhs = evalExpression(e.lhs, extra), rhs = evalExpression(e.rhs, extra);
        if (!lhs || !rhs) return fail(e);
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
        const lhs = evalExpression(e.lhs, extra), rhs = evalExpression(e.rhs, extra);
        if (!lhs || !rhs) return fail(e);
        if (e.op === "==") {
            // eslint-disable-next-line eqeqeq
            return {value: lhs.value == rhs.value ? 1n : 0n, type: CArithmetic.S32};
        } else {
            // eslint-disable-next-line eqeqeq
            return {value: lhs.value != rhs.value ? 1n : 0n, type: CArithmetic.S32};
        }

    } else if (e instanceof CBitwiseAndOr) {
        const lhs = evalInteger(e.lhs, extra), rhs = evalInteger(e.rhs, extra);
        if (!lhs || !rhs) return fail(e);
        if (e.op === "and") {
            return normalizeType({value: lhs.value & rhs.value, type: e.type});
        } else if (e.op === "or") {
            return normalizeType({value: lhs.value | rhs.value, type: e.type});
        } else {
            return normalizeType({value: lhs.value ^ rhs.value, type: e.type});
        }

    } else if (e instanceof CLogicalAndOr) {
        const lhs = evalExpression(e.lhs, extra);
        if (!lhs) return fail(e);
        if (e.op === "and") {
            // eslint-disable-next-line eqeqeq
            if (lhs.value != 0) {
                const rhs = evalExpression(e.rhs, extra);
                if (!rhs) return fail(e);
                // eslint-disable-next-line eqeqeq
                if (rhs.value != 0) return {value: 1n, type: CArithmetic.S32};
            }
            return {value: 0n, type: CArithmetic.S32};
        } else {
            // eslint-disable-next-line eqeqeq
            if (lhs.value != 0) return {value: 1n, type: CArithmetic.S32};
            const rhs = evalExpression(e.rhs, extra);
            if (!rhs) return fail(e);
            // eslint-disable-next-line eqeqeq
            if (rhs.value != 0) return {value: 1n, type: CArithmetic.S32};
            return {value: 0n, type: CArithmetic.S32};
        }

    } else if (e instanceof CConditional && (e.type instanceof CArithmetic || e.type instanceof CPointer)) {
        const test = evalExpression(e.test, extra);
        if (!test) return fail(e);
        let value: CValue | undefined;
        // eslint-disable-next-line eqeqeq
        if (test.value != 0) {
            value = evalExpression(e.trueValue, extra);
        } else {
            value = evalExpression(e.falseValue, extra);
        }
        if (!value) return fail(e);
        return normalizeType({value: value.value, type: e.type});

    }

    // for adding addressof support etc for static initializers
    if (extra !== undefined) {
        const v = extra(e, (e2) => evalExpression(e2, extra), fail);
        if (v) return v;
    }

    fail(e);
}

export function evalInteger(e: CExpression, extra?: ExtraFn): undefined | CValue & {readonly value: bigint} {
    const v = evalExpression(e, extra);
    if (v?.type instanceof CArithmetic && v.type.type !== "float") return {value: BigInt(v.value), type: v.type};
    return undefined;
}

function normalizeType(v: CValue): CValue {
    if (v.type instanceof CArithmetic) {
        if (CArithmetic.BOOL.equals(v.type)) {
            // eslint-disable-next-line eqeqeq
            return {value: v.value == 0 ? 0n : 1n, type: CArithmetic.BOOL};
        } else if (v.type.type === "float") {
            return {value: typeof v.value === "number" ? v.value : Number(v.value), type: v.type};
        } else {
            let value: bigint;
            if (typeof v.value === "number") {
                // need to emulate runtime behaviour - i.e. the use of the trunc_sat instructions
                if (isNaN(v.value)) {
                    value = 0n;
                } else if (v.value > v.type.maxValue) {
                    value = BigInt(v.type.maxValue);
                } else if (v.value < v.type.minValue) {
                    value = BigInt(v.type.minValue);
                } else {
                    value = BigInt(Math.trunc(v.value));
                }
            } else {
                value = v.value;
            }

            const bitmask = 2n ** BigInt(8 * v.type.bytes) - 1n;
            if (v.type.type === "unsigned") {
                value &= bitmask;
            } else { // signed
                const minValue = BigInt(v.type.minValue);
                value = ((value - minValue) & bitmask) + minValue;
            }

            return {value, type: v.type};
        }
    } else { // instanceof CPointer
        // normalize as if U32
        const value = normalizeType({value: v.value, type: CArithmetic.U32}).value;
        return {value: value, type: v.type};
    }
}

export const normalizeValueType = normalizeType;
