import type {ParseNode} from "../parsing/parsetree";
import {CVariable, CFunction} from "./declarations";
import {Scope} from "./scope";
import * as checks from "./type_checking";
import {CArithmetic, CType, CArray, CPointer, CUnion, CStruct,
    CSizeT, usualArithmeticConversion, integerPromotion} from "./types";

export type ExpressionType = CType | CFunction;
export type CExpression = // TODO
    CConstant | CVarIdentifier | CFnIdentifier | CStringLiteral |
    CArraySubscript | CFunctionCall | CMemberAccess | CIncrDecr | // postfix
    CAddressOf | CDereference | CUnaryPlusMinus | CBitwiseNot | CLogicalNot | CSizeof | // unary
    CCast |
    CMulDiv | CMod | CPlusMinus | CShift |
    CRelational | CEquality |
    CBitwiseAndOr | CLogicalAndOr;

export class CConstant {
    readonly lvalue = false;

    constructor(readonly node: ParseNode, readonly type: CArithmetic, readonly value: BigInt | number) {
    }
}

export class CVarIdentifier {
    readonly lvalue = true;

    constructor(readonly node: ParseNode, readonly variable: CVariable) {
    }

    get type(): CType {
        return this.variable.type;
    }
}

export class CFnIdentifier {
    readonly lvalue = false;

    constructor(readonly node: ParseNode, readonly fn: CFunction) {
    }

    get type(): CFunction {
        return this.fn;
    }
}

export function CIdentifier(node: ParseNode, name: string, scope: Scope): CVarIdentifier | CFnIdentifier {
    const value = scope.lookupIdentifier(name);
    if (value instanceof CVariable) {
        return new CVarIdentifier(node, value);
    } else {
        return new CFnIdentifier(node, value);
    }
}

export class CStringLiteral {
    readonly lvalue = false;
    readonly type: CArray;

    constructor(readonly node: ParseNode, readonly value: string) {
        // allow for null character and TODO utf8 encoding
        this.type = new CArray(CArithmetic.U8, value.length + 1);
    }
}

export class CArraySubscript {
    readonly lvalue = false;
    readonly type: CType;
    readonly body: CArray | CPointer;

    constructor(readonly node: ParseNode, body: CExpression, readonly idx: CExpression) {
        this.body = checks.asArrayOrPointer(body.node, body.type);
        checks.asInteger(idx.node, idx.type);
        this.type = this.body.type;
    }
}

export class CFunctionCall {
    readonly lvalue = false;
    readonly type: CType;
    readonly function: CFunction;

    constructor(readonly node: ParseNode, body: CExpression, readonly args: CExpression[]) {
        this.function = checks.asFunction(body.node, body.type);
        this.type = this.function.type;
        // TODO check types of parameters
    }
}

export class CMemberAccess {
    readonly lvalue: boolean;
    readonly type: CType;
    readonly body: CStruct | CUnion;

    /** transform `e->member` to `(*e).member` before calling */
    constructor(readonly node: ParseNode, body: CExpression, readonly member: string) {
        this.body = checks.asStructOrUnion(body.node, body.type);
        this.type = this.body.memberType(member);
        this.lvalue = body.lvalue && !(this.type instanceof CArray);
    }
}

export class CIncrDecr {
    readonly lvalue = false;
    readonly type: CArithmetic;

    constructor(readonly node: ParseNode, readonly body: CExpression,
                readonly op: "++" | "op", readonly pos: "pre" | "post") {
        checks.checkLvalue(body, true);
        this.type = checks.asArithmetic(body.node, body.type);
    }
}

export class CSizeof {
    readonly lvalue = false;
    readonly type = CSizeT;

    constructor(readonly node: ParseNode, readonly body: CExpression | CType) {
        // TODO check body valid sizeof type
    }
}

export class CAddressOf { // &
    readonly lvalue = false;
    readonly type: CPointer;

    constructor(readonly node: ParseNode, readonly body: CExpression) {
        checks.checkLvalue(body, true);
        this.type = new CPointer(checks.asCType(body));
    }
}

export class CDereference { // * or 'indirection'
    readonly lvalue = true;
    readonly type: CType;

    constructor(readonly node: ParseNode, readonly body: CExpression) {
        this.type = checks.asPointer(node, body.type).type;
    }
}

export class CUnaryPlusMinus {
    readonly lvalue = false;
    readonly type: CArithmetic;
    readonly bodyType: CArithmetic;

    constructor(readonly node: ParseNode, readonly body: CExpression, readonly op: "+" | "-") {
        this.bodyType = checks.asArithmetic(body.node, body.type);
        this.type = this.bodyType.type === "float" ? this.bodyType : CArithmetic.S32;
    }
}

export class CBitwiseNot {
    readonly lvalue = false;
    readonly type: CArithmetic;
    readonly bodyType: CArithmetic;

    constructor(readonly node: ParseNode, readonly body: CExpression) {
        this.bodyType = checks.asInteger(body.node, body.type);
        this.type = this.bodyType.bytes < CArithmetic.S32.bytes ? CArithmetic.S32 : this.bodyType;
    }
}

export class CLogicalNot {
    readonly lvalue = false;
    readonly type = CArithmetic.S32;

    constructor(readonly node: ParseNode, readonly body: CExpression) {
        checks.asArrayOrPointer(body.node, body.type);
    }
}

export class CCast {
    readonly lvalue = false;

    constructor(readonly node: ParseNode, readonly type: CType, readonly body: CExpression) {
    }
}

export class CMulDiv {
    readonly lvalue = false;
    readonly type: CArithmetic;

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression, readonly op: "*" | "/") {
        this.type = usualArithmeticConversion(
            checks.asArithmetic(lhs.node, lhs.type),
            checks.asArithmetic(rhs.node, rhs.type));
    }
}

export class CMod {
    readonly lvalue = false;
    readonly type: CArithmetic;

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression) {
        this.type = usualArithmeticConversion(
            checks.asInteger(lhs.node, lhs.type),
            checks.asInteger(rhs.node, rhs.type));
    }
}

export class CPlusMinus {
    readonly lvalue = false;
    readonly type: CArithmetic;

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression, readonly op: "+" | "-") {
        this.type = usualArithmeticConversion(
            checks.asArithmetic(lhs.node, lhs.type),
            checks.asArithmetic(rhs.node, rhs.type));
        // TODO allow pointers
    }
}

export class CShift {
    readonly lvalue = false;
    readonly type: CArithmetic;

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression) {
        this.type = integerPromotion(checks.asInteger(lhs.node, lhs.type));
        checks.asInteger(rhs.node, rhs.type);
    }
}

export class CRelational {
    readonly lvalue = false;
    readonly type = CArithmetic.S32;

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression, readonly op: "<" | ">" | "<=" | ">=") {
        checks.asArithmeticOrPointer(lhs.node, lhs.type);
        checks.asArithmeticOrPointer(rhs.node, rhs.type);
    }
}

export class CEquality {
    readonly lvalue = false;
    readonly type = CArithmetic.S32;

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression, readonly op: "==" | "!=") {
        checks.asArithmeticOrPointer(lhs.node, lhs.type);
        checks.asArithmeticOrPointer(rhs.node, rhs.type);
    }
}

export class CBitwiseAndOr {
    readonly lvalue = false;
    readonly type: CArithmetic;

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression, readonly op: "and" | "or" | "xor") {
        this.type = usualArithmeticConversion(
            checks.asInteger(lhs.node, lhs.type),
            checks.asInteger(rhs.node, rhs.type));
    }
}

export class CLogicalAndOr {
    readonly lvalue = false;
    readonly type = CArithmetic.S32;

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression, readonly op: "&&" | "||") {
        checks.asArithmeticOrPointer(lhs.node, lhs.type);
        checks.asArithmeticOrPointer(rhs.node, rhs.type);
    }
}
