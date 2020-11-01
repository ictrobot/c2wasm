import type {ParseNode} from "../parsing";
import type {CDeclaration, CVariable} from "./declarations";
import * as checks from "./type_checking";
import {
    CArithmetic, CType, CArray, CPointer, CUnion, CStruct,
    CSizeT, usualArithmeticConversion, integerPromotion, CFuncType, CVoid, CEnum
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

    constructor(readonly node: ParseNode, readonly type: CArithmetic | CEnum, readonly value: BigInt | number) {
        super();
    }

    evaluate(): CConstant {
        return this;
    }
}

export class CIdentifier extends CEvaluable {
    readonly lvalue: boolean;

    constructor(readonly node: ParseNode, readonly value: CDeclaration, readonly initialAssignment: boolean = false) {
        super();
        this.lvalue = (initialAssignment || value.type.qualifier !== "const") && !(value.type instanceof CFuncType);
    }

    get type(): CType {
        return this.value.type;
    }

    evaluate(): CConstant {
        // only constant if points to an enum identifier
        if (this.value.type.typeName === "enum" && (this.value as CVariable).staticValue instanceof CConstant) {
            return (this.value as CVariable).staticValue as CConstant;
        }
        throw new checks.ExpressionTypeError(this.node, "constant expression", "non-enum constant identifier");
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

    toInitializer(): CInitializer {
        const constants: CConstant[] = this.value.map(x => new CConstant(this.node, CArithmetic.U8, x));
        return new CInitializer(this.node, constants, this.type);
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

    /** transform `e->member` to `(*e).member` before calling */
    constructor(readonly node: ParseNode, readonly body: CExpression, readonly member: string) {
        const type = checks.asStructOrUnion(body.node, body.type);
        this.type = type.memberType(member);
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
        if (body.incomplete || body.bytes === 0 || body instanceof CFuncType) {
            throw new checks.ExpressionTypeError(node, "Complete non-function type", body.typeName);
        }
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
        checks.asArithmeticOrPointer(body.node, body.type);
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
        // TODO allow pointers to complete types
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

    // rhs may require casting
    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression | CInitializer) {
        CAssignment.checkLvalue(lhs);
        this.type = lhs.type;

        CAssignment.checkAssignmentValid(node, lhs.type, rhs.type);
    }

    private static checkLvalue(e: CExpression) {
        checks.checkLvalue(e, true);
        if (e.type instanceof CArray || e.type instanceof CFuncType || e.type.incomplete || e.type.bytes === 0) {
            throw new checks.ExpressionTypeError(e.node, "Assignable lvalue", e.type.typeName);
        }
    }

    static checkAssignmentValid(node: ParseNode, varType: CType, valueType: CType): void {
        if (varType instanceof CArithmetic && (valueType instanceof CArithmetic || valueType instanceof CEnum)) {
            return;
        } else if (varType.equals(valueType)) {
            return;
        }
        // TODO implement full type rules including casting const 0 to ptr
        throw new checks.ExpressionTypeError(node, "assignment to have the same type", "different types");
    }
}

export class CComma {
    readonly lvalue = false;
    readonly type: CType;

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression) {
        this.type = rhs.type;
    }
}

/** Special type of expression permitted only in declarations */
export class CInitializer {
    private _type: CType;

    constructor(readonly node: ParseNode, readonly body: (CExpression | CInitializer)[], type?: CType) {
        // default to a void* array which isn't the true type but lets the array size be used when declaring arrays
        this._type = type ?? new CArray(new CPointer(new CVoid()), body.length);

        // convert string literals to list initializers
        for (let i = 0; i < this.body.length; i++) {
            const value = this.body[i];
            if (value instanceof CStringLiteral) this.body[i] = value.toInitializer();
        }
    }

    get type(): CType {
        return this._type;
    }

    set type(value: CType) {
        // TODO nested type checking
        let error = false;
        if (value instanceof CArray) {
            if (this.body.length > (value.length ?? Infinity)) error = true;
        } else if (value instanceof CStruct) {
            if (this.body.length > value.members.length) error = true;
        } else if (value instanceof CUnion) {
            if (this.body.length > 1) error = true;
        } else {
            error = true;
        }
        if (error) throw new checks.ExpressionTypeError(this.node, "initializer to match type", "non-matching initializer");
        this._type = value;
    }

    evaluate(): (CConstant | CStringLiteral)[] {
        const value = [];
        // TODO take into account not every member has to be specified when nesting
        for (const child of this.body) {
            if (child instanceof CInitializer) {
                value.push(...child.evaluate());
            } else if (child instanceof CEvaluable) {
                value.push(child.evaluate());
            } else if (child instanceof CStringLiteral) {
                value.push(child);
            }
        }
        return value;
    }

    asStatic(): this {
        for (const child of this.body) {
            if (!(child instanceof CInitializer || child instanceof CEvaluable)) {
                throw new checks.ExpressionTypeError(child.node, "constant expression", "non-constant expression");
            }
        }
        return this;
    }
}
