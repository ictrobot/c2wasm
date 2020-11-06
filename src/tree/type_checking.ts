import {CError} from "../c_error";
import type {ParseNode} from "../parsing";
import type {CExpression} from "./expressions";
import {CArithmetic, CPointer, CStruct, CUnion, CType, CFuncType, checkTypeComplete} from "./types";

export class ExpressionTypeError extends CError {
    name = "ExpressionTypeError";

    constructor(node: ParseNode, readonly wantedType: string, readonly actualType?: string) {
        super(actualType ? `Expected ${wantedType} but got ${actualType} instead!` : `Expected ${wantedType}`, node);
    }
}

// Basic type checking for expressions, throws an exception if the expression's type is not the expected type

export function asArithmetic(node: ParseNode, t: CType): CArithmetic {
    if (t instanceof CArithmetic) return t;
    throw new ExpressionTypeError(node, "arithmetic", t.typeName);
}

export function asInteger(node: ParseNode, t: CType): CArithmetic {
    const arithmetic = asArithmetic(node, t);
    switch (arithmetic.type) {
    case "signed":
    case "unsigned":
        return arithmetic;
    default:
        throw new ExpressionTypeError(node, "integer", t.typeName);
    }
}

export function asPointer(node: ParseNode, t: CType): CPointer {
    if (t instanceof CPointer) return t;
    throw new ExpressionTypeError(node, "pointer", t.typeName);
}

export function asArithmeticOrPointer(node: ParseNode, t: CType): CArithmetic | CPointer {
    if (t instanceof CArithmetic) return t;
    if (t instanceof CPointer) return t;
    throw new ExpressionTypeError(node, "arithmetic or pointer", t.typeName);
}

export function asFunction(node: ParseNode, t: CType): CFuncType {
    if (t instanceof CFuncType) return t;
    throw new ExpressionTypeError(node, "function", t.typeName);
}

export function asStructOrUnion(node: ParseNode, t: CType): CStruct | CUnion {
    checkTypeComplete(t);
    if (t instanceof CStruct) return t;
    if (t instanceof CUnion) return t;
    throw new ExpressionTypeError(node, "struct or union", t.typeName);
}

export function checkLvalue(expression: CExpression, lvalue: boolean): CExpression {
    if (expression.lvalue === lvalue) return expression;
    throw new ExpressionTypeError(expression.node, `lvalue=${lvalue}`, `lvalue=${expression.lvalue}`);
}

export function asCType(expression: CExpression): CType {
    if (!(expression.type instanceof CFuncType)) return expression.type;
    throw new ExpressionTypeError(expression.node, "non-function", "function");
}
