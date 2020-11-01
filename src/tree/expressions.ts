import type {ParseNode, pt} from "../parsing";
import type {CDeclaration, CVariable} from "./declarations";
import * as checks from "./type_checking";
import {
    CArithmetic, CType, CArray, CPointer, CUnion, CStruct,
    CSizeT, usualArithmeticConversion, integerPromotion, CFuncType, CVoid, CEnum, checkTypeComplete, getQualifier
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

    constructor(readonly node: ParseNode, readonly value: CDeclaration) {
        super();
        this.lvalue = !(value.type instanceof CFuncType);
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
        // currently only supports UTF8
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
    readonly fnType: CFuncType;
    readonly type: CType;

    constructor(readonly node: ParseNode, readonly body: CExpression, readonly args: CExpression[]) {
        this.fnType = checks.asFunction(body.node, body.type);
        this.type = this.fnType.returnType;

        if (this.fnType.parameterTypes.length !== args.length) {
            throw new checks.ExpressionTypeError(node, `${this.fnType.parameterTypes.length} argument(s)`, `${args.length}`);
        }
        for (let i = 0; i < args.length; i++) {
            CAssignment.checkAssignmentValid(args[i].node, this.fnType.parameterTypes[i], args[i]);
        }
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
    readonly type: CArithmetic | CPointer;

    constructor(readonly node: ParseNode, readonly body: CExpression,
                readonly op: "++" | "--", readonly pos: "pre" | "post") {
        checks.checkLvalue(body, true);

        this.type = checks.asArithmeticOrPointer(body.node, body.type);
        if (this.type instanceof CPointer) checkTypeComplete(this.type.type);
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
    readonly type: CArithmetic | CPointer;

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression, readonly op: "+" | "-") {
        if (lhs.type instanceof CPointer && rhs.type instanceof CPointer) { // both pointers
            if (!lhs.type.equals(rhs.type)) throw new checks.ExpressionTypeError(node, "both pointers to have the same type");
            checkTypeComplete(lhs.type.type);
            this.type = lhs.type;

        } else if (lhs.type instanceof CPointer) { // one pointer, one integral
            checks.asInteger(rhs.node, rhs.type);
            checkTypeComplete(lhs.type.type);
            this.type = lhs.type;

        } else if (rhs.type instanceof CPointer) { // one pointer, one integral
            checks.asInteger(lhs.node, lhs.type);
            checkTypeComplete(rhs.type.type);
            this.type = rhs.type;

        } else {
            this.type = usualArithmeticConversion(checks.asArithmetic(lhs.node, lhs.type), checks.asArithmetic(rhs.node, rhs.type));
        }
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
            // TODO implement full type rules for conditional expressions
            throw new checks.ExpressionTypeError(node, "both branches to have the same type", "different types");
        }
    }
}

export class CAssignment {
    readonly lvalue = false;
    readonly type: CType;

    // rhs may require casting
    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression | CInitializer,
                readonly assignmentType: pt.AssignmentType, readonly initialAssignment: boolean = false) {
        // check lvalue
        checks.checkLvalue(lhs, true);
        if (lhs.type instanceof CArray || lhs.type instanceof CFuncType ||
            lhs.type.incomplete || lhs.type.bytes === 0 || (getQualifier(lhs.type) === "const" && !initialAssignment)) {
            throw new checks.ExpressionTypeError(lhs.node, "assignable lvalue");
        }
        this.type = lhs.type;

        // check assignment types are valid
        if (assignmentType) {
            if (rhs instanceof CInitializer) {
                throw new checks.ExpressionTypeError(node,"simple assignments with structure initializers");
            }
            let rhsType = rhs.type;

            // typecheck `lhs op= rhs` as `lhs = lhs op rhs`
            // LHS only evaluated once so can't just be transformed: see `a[i++] += 1;`
            switch (assignmentType) {
            case "mul": rhsType = new CMulDiv(node, lhs, rhs, "*").type; break;
            case "div": rhsType = new CMulDiv(node, lhs, rhs, "/").type; break;
            case "mod": rhsType = new CMod(node, lhs, rhs).type; break;
            case "add": rhsType = new CAddSub(node, lhs, rhs, "+").type; break;
            case "sub": rhsType = new CAddSub(node, lhs, rhs, "-").type; break;
            case "leftShift": rhsType = new CShift(node, lhs, rhs, "left").type; break;
            case "rightShift": rhsType = new CShift(node, lhs, rhs, "right").type; break;
            case "bitwiseAnd": rhsType = new CBitwiseAndOr(node, lhs, rhs, "and").type; break;
            case "bitwiseOr": rhsType = new CBitwiseAndOr(node, lhs, rhs, "or").type; break;
            case "bitwiseXor": rhsType = new CBitwiseAndOr(node, lhs, rhs, "xor").type; break;
            default: throw new checks.ExpressionTypeError(node, "valid assignment type");
            }
            CAssignment._checkAssignmentTypeValid(node, lhs.type, rhsType);
        } else {
            CAssignment.checkAssignmentValid(node, lhs.type, rhs);
        }
    }

    static checkAssignmentValid(node: ParseNode, varType: CType, value: CExpression | CInitializer): void {
        // also allow constant 0 to be assigned to a pointer
        if (varType instanceof CPointer && value instanceof CConstant) {
            if (value.value === 0n) return;
        }
        this._checkAssignmentTypeValid(node, varType, value.type);
    }

    private static _checkAssignmentTypeValid(node: ParseNode, varType: CType, valueType: CType): void {
        if (varType.equals(valueType)) return;
        if (varType instanceof CArithmetic && (valueType instanceof CArithmetic || valueType instanceof CEnum)) {
            return; // arithmetic types always assignable
        }
        if (varType instanceof CPointer && valueType instanceof CPointer) {
            // void pointers can be assigned to any pointer and any pointer can be assigned to a void pointer
            if (varType.type instanceof CVoid || valueType.type instanceof CVoid) return;
            // allow non-constant pointers to be assigned to constant pointers
            if (varType.type.equals(valueType.type) && valueType.qualifier !== "const") return;
        }

        throw new checks.ExpressionTypeError(node, varType.typeName, valueType.typeName);
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
        const error = () => {
            throw new checks.ExpressionTypeError(this.node, "initializer to match type");
        };

        if (value instanceof CArray) {
            if (this.body.length > (value.length ?? Infinity)) error();
            this.body.forEach(x => CInitializer.typeCheck(value.type, x));

        } else if (value instanceof CStruct) {
            if (this.body.length > value.members.length) error();
            this.body.forEach((x, i) => CInitializer.typeCheck(value.members[i].type, x));

        } else if (value instanceof CUnion) {
            if (this.body.length > 1) error();
            if (this.body.length === 1) CInitializer.typeCheck(value.members[0].type, this.body[0]);

        } else {
            error();
        }
        this._type = value;
    }

    asStatic(): this {
        for (let i = 0; i < this.body.length; i++) {
            const child = this.body[i];
            if (child instanceof CInitializer) {
                child.asStatic();
            } else if (child instanceof CEvaluable) {
                this.body[i] = child.evaluate();
            } else if (child instanceof CStringLiteral) {
                this.body[i] = child.toInitializer().asStatic();
            } else {
                throw new checks.ExpressionTypeError(child.node, "constant expression");
            }
        }
        return this;
    }

    private static typeCheck(desiredType: CType, expr: CExpression | CInitializer) {
        if (expr instanceof CInitializer) {
            expr.type = desiredType;
        } else {
            CAssignment.checkAssignmentValid(expr.node, desiredType, expr);
        }
    }
}
