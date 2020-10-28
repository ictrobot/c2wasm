import type {ParseNode} from "../parsing/parsetree";
import {CFunction} from "./declarations";
import type {ExpressionType, CExpression} from "./expressions";
import {CArithmetic, CArray, CPointer, CStruct, CUnion, CType} from "./types";

export class ExpressionTypeError extends Error {
    name = "ExpressionTypeError";

    constructor(readonly node: ParseNode, readonly wantedType: string, readonly actualType: string) {
        super(`Expected ${wantedType} but got ${actualType} instead!`);
    }
}

export function asArithmetic(node: ParseNode, t: ExpressionType): CArithmetic {
    if (t instanceof CArithmetic) return t;
    throw new ExpressionTypeError(node, "arithmetic", t.typeName);
}

export function asInteger(node: ParseNode, t: ExpressionType): CArithmetic {
    const arithmetic = asArithmetic(node, t);
    switch (arithmetic.type) {
    case "signed":
    case "unsigned":
        return arithmetic;
    default:
        throw new ExpressionTypeError(node, "integer", t.typeName);
    }
}

export function asPointer(node: ParseNode, t: ExpressionType): CPointer {
    if (t instanceof CPointer) return t;
    throw new ExpressionTypeError(node, "pointer", t.typeName);
}

export function asArithmeticOrPointer(node: ParseNode, t: ExpressionType): CArithmetic | CPointer {
    if (t instanceof CArithmetic) return t;
    if (t instanceof CPointer) return t;
    throw new ExpressionTypeError(node, "arithmetic or pointer", t.typeName);
}

export function asArrayOrPointer(node: ParseNode, t: ExpressionType): CArray | CPointer {
    if (t instanceof CArray) return t;
    if (t instanceof CPointer) return t;
    throw new ExpressionTypeError(node, "array or pointer", t.typeName);
}

export function asFunction(node: ParseNode, t: ExpressionType): CFunction {
    if (t instanceof CFunction) return t;
    throw new ExpressionTypeError(node, "function", t.typeName);
}

export function asStructOrUnion(node: ParseNode, t: ExpressionType): CStruct | CUnion {
    if (t instanceof CStruct) return t;
    if (t instanceof CUnion) return t;
    throw new ExpressionTypeError(node, "struct or union", t.typeName);
}

export function checkLvalue(expression: CExpression, lvalue: boolean): CExpression {
    if (expression.lvalue === lvalue) return expression;
    throw new ExpressionTypeError(expression.node, `lvalue=${lvalue}`, `lvalue=${expression.lvalue}`);
}

export function asCType(expression: CExpression): CType {
    if (!(expression.type instanceof CFunction)) return expression.type;
    throw new ExpressionTypeError(expression.node, "non-function", "function");
}
