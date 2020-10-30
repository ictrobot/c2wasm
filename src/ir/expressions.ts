import type {ParseNode} from "../parsing";
import type {CDeclaration} from "./declarations";
import * as checks from "./type_checking";
import {
    CArithmetic, CType, CArray, CPointer, CUnion, CStruct,
    CSizeT, usualArithmeticConversion, integerPromotion, CFuncType
} from "./types";

export type CExpression =
    CConstant | CIdentifier | CStringLiteral |
    CFunctionCall | CMemberAccess | CIncrDecr | // postfix
    CAddressOf | CDereference | CUnaryPlusMinus | CBitwiseNot | CLogicalNot | CSizeof | // unary
    CCast |
    CMulDiv | CMod | CAddSub | CShift |
    CRelational | CEquality |
    CBitwiseAndOr | CLogicalAndOr |
    CConditional | CAssignment | CComma;

export abstract class CEvaluable {
    abstract evaluate(): CConstant;
}

export class CConstant extends CEvaluable {
    readonly lvalue = false;

    constructor(readonly node: ParseNode, readonly type: CArithmetic, readonly value: BigInt | number) {
        super();
    }

    evaluate(): CConstant {
        return this;
    }
}

export class CIdentifier {
    readonly lvalue: boolean;

    constructor(readonly node: ParseNode, readonly value: CDeclaration) {
        // TODO const values whilst allowing initial assignment
        // (value.type.qualifier !== "const") &&
        this.lvalue = !(value.type instanceof CFuncType);
    }

    get type(): CType {
        return this.value.type;
    }
}

export class CStringLiteral {
    readonly lvalue = false;
    readonly type: CArray;

    constructor(readonly node: ParseNode, readonly value: BigInt[]) {
        //TODO utf8?
        if (value.length === 0 || value[value.length - 1] !== 0n) {
            throw new checks.ExpressionTypeError(node, "null terminated char[]", "char[]");
        }
        this.type = new CArray(CArithmetic.U8, value.length);
    }
}

export class CFunctionCall {
    readonly lvalue = false;
    readonly type: CType;

    constructor(readonly node: ParseNode, readonly body: CExpression, readonly args: CExpression[]) {
        this.type = checks.asFunction(body.node, body.type).returnType;
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
                readonly op: "++" | "--", readonly pos: "pre" | "post") {
        checks.checkLvalue(body, true);
        this.type = checks.asArithmetic(body.node, body.type);
    }
}

export class CSizeof {
    readonly lvalue = false;
    readonly type = CSizeT;

    constructor(readonly node: ParseNode, readonly body: CType) {
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

// Array subscript a[b] becomes *(a + b)
export class CAddSub {
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

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression, readonly dir: "left" | "right") {
        this.type = integerPromotion(checks.asInteger(lhs.node, lhs.type));
        checks.asInteger(rhs.node, rhs.type);
    }
}

export class CRelational {
    readonly lvalue = false;
    readonly type = CArithmetic.S32;

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression, readonly op: "LT" | "GT" | "LEq" | "GEq") {
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

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression, readonly op: "and" | "or") {
        checks.asArithmeticOrPointer(lhs.node, lhs.type);
        checks.asArithmeticOrPointer(rhs.node, rhs.type);
    }
}

export class CConditional {
    readonly lvalue = false;
    readonly type: CType;

    constructor(readonly node: ParseNode, readonly test: CExpression, readonly trueValue: CExpression, readonly falseValue: CExpression) {
        checks.asArithmeticOrPointer(test.node, test.type);
        if (trueValue.type instanceof CArithmetic && falseValue.type instanceof CArithmetic) {
            this.type = usualArithmeticConversion(trueValue.type, falseValue.type);
        } else if (this.trueValue.type.equals(this.falseValue.type)) {
            this.type = this.trueValue.type;
        } else {
            // TODO implement full type rules including casting const 0 to ptr
            throw new checks.ExpressionTypeError(node, "both branches to have the same type", "different types");
        }
    }
}

export class CAssignment {
    readonly lvalue = false;
    readonly type: CType;

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression) {
        CAssignment.checkLvalue(lhs);

        if (lhs.type instanceof CArithmetic && rhs.type instanceof CArithmetic) {
            this.type = usualArithmeticConversion(lhs.type, rhs.type);
        } else if (lhs.type.equals(rhs.type)) {
            this.type = this.lhs.type;
        } else {
            // TODO implement full type rules including casting const 0 to ptr
            throw new checks.ExpressionTypeError(node, "assignment to have the same type", "different types");
        }
    }

    private static checkLvalue(e: CExpression) {
        checks.checkLvalue(e, true);
        if (e.type instanceof CArray || e.type instanceof CFuncType) {
            throw new checks.ExpressionTypeError(e.node, "Assignable lvalue", e.type.typeName);
        }
        // TODO implement const and incomplete type checks
    }
}

export class CComma {
    readonly lvalue = false;
    readonly type: CType;

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression) {
        this.type = rhs.type;
    }
}
