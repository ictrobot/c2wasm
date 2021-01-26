import type {ParseNode, pt} from "../parsing";
import type {CDeclaration, CVariable, CArgument} from "./declarations";
import * as checks from "./type_checking";
import {
    CArithmetic, CType, CArray, CPointer, CUnion, CStruct,
    CSizeT, usualArithmeticConversion, integerPromotion, CFuncType, CVoid, checkTypeComplete, getQualifier
} from "./types";

// Classes to represent all the possible expression types in the IR

export type CExpression =
    CConstant | CIdentifier | CStringLiteral |
    CFunctionCall | CMemberAccess | CIncrDecr | // postfix
    CAddressOf | CDereference | CUnaryPlusMinus | CBitwiseNot | CLogicalNot | CSizeof | // unary
    CCast |
    CMulDiv | CMod | CAddSub | CShift |
    CRelational | CEquality |
    CBitwiseAndOr | CLogicalAndOr |
    CConditional | CAssignment | CComma;

// evaluated expression, value and type pair
export type CValue = {readonly value: number | bigint, readonly type: CArithmetic | CPointer};

export class CConstant {
    readonly lvalue = false;

    constructor(readonly node: ParseNode, readonly type: CArithmetic, readonly value: bigint | number) {
    }

    changeType(type: CArithmetic): CConstant {
        if (this.type.equals(type)) return this;

        let newValue: bigint | number;
        if (type.equals(CArithmetic.BOOL)) {
            // eslint-disable-next-line eqeqeq
            newValue = this.value == 0 ? 0 : 1;
        } else if (type.type === "float") {
            newValue = Number(this.value);
        } else {
            if (this.value > type.maxValue || this.value < type.minValue) {
                throw new checks.ExpressionTypeError(this.node, `value which fits in ${type.name}`, this.value.toString());
            }
            newValue = BigInt(this.value);
        }
        return new CConstant(this.node, type, newValue);
    }

    // for analyzing expression dependencies
    *identifiers(): IterableIterator<CIdentifier> {
        // no identifier children
    }
}

export class CIdentifier {
    readonly lvalue: boolean;

    constructor(readonly node: ParseNode, readonly value: CDeclaration) {
        this.lvalue = !(value.type instanceof CFuncType);
    }

    get type(): CType {
        return this.value.type.pointerGeneration;
    }

    *identifiers(): IterableIterator<CIdentifier> {
        yield this;
    }
}

export class CStringLiteral {
    readonly lvalue = false;
    readonly type: CPointer;

    constructor(readonly node: ParseNode, readonly value: bigint[]) {
        // currently only supports UTF8
        if (value.length === 0 || value[value.length - 1] !== 0n) {
            throw new checks.ExpressionTypeError(node, "null terminated char[]", "char[]");
        }
        this.type = new CArray(node, CArithmetic.U8, value.length).pointerGeneration;
    }

    *identifiers(): IterableIterator<CIdentifier> {
        // no identifier children
    }
}

export class CFunctionCall {
    readonly lvalue = false;
    readonly fnType: CFuncType;
    readonly type: CType;

    constructor(readonly node: ParseNode, readonly body: CExpression, readonly args: CExpression[]) {
        this.fnType = checks.asFunction(body.node, body.type);
        this.type = this.fnType.returnType.pointerGeneration;

        // check arguments correct for the function type
        if (this.fnType.variadic && this.fnType.parameterTypes.length > args.length) {
            throw new checks.ExpressionTypeError(node, `at least ${this.fnType.parameterTypes.length} argument(s) to variadic function`);
        } else if (!this.fnType.variadic && this.fnType.parameterTypes.length !== args.length) {
            throw new checks.ExpressionTypeError(node, `${this.fnType.parameterTypes.length} argument(s)`, `${args.length}`);
        }
        for (let i = 0; i < this.fnType.parameterTypes.length; i++) {
            CAssignment.checkAssignmentValid(args[i].node, this.fnType.parameterTypes[i], args[i]);
        }
    }

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.body.identifiers();
        for (const a of this.args) yield* a.identifiers();
    }
}

export class CMemberAccess {
    readonly lvalue: boolean;
    readonly structUnion: CStruct | CUnion;
    readonly type: CType;

    /** transform `e.member` to `(&e)->member` before calling */
    constructor(readonly node: ParseNode, readonly body: CExpression, readonly member: string) {
        const bodyType = body.type instanceof CPointer ? (body.type.original ?? body.type) : body.type; // no pointer gen
        const pointerType = checks.asPointer(body.node, bodyType);
        this.structUnion = checks.asStructOrUnion(body.node, pointerType.type);

        const type = this.structUnion.memberType(member);
        this.type = type.pointerGeneration;
        this.lvalue = !(this.type instanceof CArray);
    }

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.body.identifiers();
    }
}

export class CIncrDecr {
    readonly lvalue = false;
    readonly type: CArithmetic | CPointer;

    constructor(readonly node: ParseNode, readonly body: CExpression,
                readonly op: "++" | "--", readonly pos: "pre" | "post") {
        checks.checkLvalue(body, true);

        const bodyType = body.type instanceof CPointer ? (body.type.original ?? body.type) : body.type; // no pointer gen
        this.type = checks.asNonFunctionPointer(body.node, checks.asArithmeticOrPointer(body.node, bodyType));
        if (this.type instanceof CPointer) checkTypeComplete(this.type.type);
    }

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.body.identifiers();
    }
}

export class CSizeof {
    readonly lvalue = false;
    readonly type = CSizeT;
    readonly body: CType;

    constructor(readonly node: ParseNode, body: CType) {
        this.body = body instanceof CPointer ? (body.original ?? body) : body; // no pointer gen
        if (this.body.incomplete || this.body.bytes === 0 || this.body instanceof CFuncType) {
            throw new checks.ExpressionTypeError(node, "Complete non-function type", body.typeName);
        }
    }

    *identifiers(): IterableIterator<CIdentifier> {
        // no identifier children
    }
}

export class CAddressOf { // &
    readonly lvalue = false;
    readonly type: CPointer;
    readonly body: CExpression;

    constructor(readonly node: ParseNode, body: CExpression) {
        const bodyType = body.type instanceof CPointer ? (body.type.original ?? body.type) : body.type; // no pointer gen
        if (!(body instanceof CIdentifier && bodyType instanceof CFuncType)) checks.checkLvalue(body, true);
        this.type = new CPointer(node, bodyType);

        if (body instanceof CIdentifier) {
            // when translating to wasm all variables which have their address taken have to be stored on the shadow stack
            (body.value as CVariable | CArgument).addressUsed = true;
        }
        this.body = body;
    }

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.body.identifiers();
    }
}

export class CDereference { // * or 'indirection'
    readonly lvalue = true;
    readonly type: CType;

    constructor(readonly node: ParseNode, readonly body: CExpression) {
        this.type = checks.asPointer(node, body.type).type.pointerGeneration;
    }

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.body.identifiers();
    }
}

export class CUnaryPlusMinus {
    readonly lvalue = false;
    readonly type: CArithmetic;
    readonly bodyType: CArithmetic;

    constructor(readonly node: ParseNode, readonly body: CExpression, readonly op: "+" | "-") {
        this.bodyType = checks.asArithmetic(body.node, body.type);
        this.type = integerPromotion(this.bodyType);
    }

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.body.identifiers();
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

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.body.identifiers();
    }
}

export class CLogicalNot {
    readonly lvalue = false;
    readonly type = CArithmetic.S32;

    constructor(readonly node: ParseNode, readonly body: CExpression) {
        checks.asArithmeticOrPointer(body.node, body.type);
    }

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.body.identifiers();
    }
}

export class CCast {
    readonly lvalue = false;
    readonly type: CType;

    constructor(readonly node: ParseNode, type: CType, readonly body: CExpression) {
        this.type = type.pointerGeneration;
    }

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.body.identifiers();
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

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.lhs.identifiers();
        yield* this.rhs.identifiers();
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

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.lhs.identifiers();
        yield* this.rhs.identifiers();
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
            this.type = checks.asNonFunctionPointer(lhs.node, lhs.type);
            checks.asNonFunctionPointer(rhs.node, rhs.type);

        } else if (lhs.type instanceof CPointer) { // one pointer, one integral
            checks.asInteger(rhs.node, rhs.type);
            checkTypeComplete(lhs.type.type);
            this.type = checks.asNonFunctionPointer(lhs.node, lhs.type);

        } else if (rhs.type instanceof CPointer) { // one pointer, one integral
            checks.asInteger(lhs.node, lhs.type);
            checkTypeComplete(rhs.type.type);
            this.type = checks.asNonFunctionPointer(rhs.node, rhs.type);

        } else {
            this.type = usualArithmeticConversion(checks.asArithmetic(lhs.node, lhs.type), checks.asArithmetic(rhs.node, rhs.type));
        }
    }

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.lhs.identifiers();
        yield* this.rhs.identifiers();
    }
}

export class CShift {
    readonly lvalue = false;
    readonly type: CArithmetic;

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression, readonly dir: "left" | "right") {
        this.type = integerPromotion(checks.asInteger(lhs.node, lhs.type));
        checks.asInteger(rhs.node, rhs.type);
    }

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.lhs.identifiers();
        yield* this.rhs.identifiers();
    }
}

export class CRelational {
    readonly lvalue = false;
    readonly type = CArithmetic.BOOL;
    readonly commonType: CArithmetic;

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression, readonly op: "LT" | "GT" | "LEq" | "GEq") {
        checks.asArithmeticOrPointer(lhs.node, lhs.type);
        checks.asArithmeticOrPointer(rhs.node, rhs.type);

        this.commonType = usualArithmeticConversion(
            lhs.type instanceof CArithmetic ? lhs.type : CSizeT,
            rhs.type instanceof CArithmetic ? rhs.type : CSizeT);
    }

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.lhs.identifiers();
        yield* this.rhs.identifiers();
    }
}

export class CEquality {
    readonly lvalue = false;
    readonly type = CArithmetic.BOOL;
    readonly commonType: CArithmetic;

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression, readonly op: "==" | "!=") {
        checks.asArithmeticOrPointer(lhs.node, lhs.type);
        checks.asArithmeticOrPointer(rhs.node, rhs.type);

        this.commonType = usualArithmeticConversion(
            lhs.type instanceof CArithmetic ? lhs.type : CSizeT,
            rhs.type instanceof CArithmetic ? rhs.type : CSizeT);
    }

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.lhs.identifiers();
        yield* this.rhs.identifiers();
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

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.lhs.identifiers();
        yield* this.rhs.identifiers();
    }
}

export class CLogicalAndOr {
    readonly lvalue = false;
    readonly type = CArithmetic.BOOL;

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression, readonly op: "and" | "or") {
        checks.asArithmeticOrPointer(lhs.node, lhs.type);
        checks.asArithmeticOrPointer(rhs.node, rhs.type);
    }

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.lhs.identifiers();
        yield* this.rhs.identifiers();
    }
}

export class CConditional { // [test] ? [trueValue] : [falseValue]
    readonly lvalue = false;
    readonly type: CType;

    constructor(readonly node: ParseNode, readonly test: CExpression, readonly trueValue: CExpression, readonly falseValue: CExpression) {
        checks.asArithmeticOrPointer(test.node, test.type);

        if (trueValue.type instanceof CArithmetic && falseValue.type instanceof CArithmetic) {
            this.type = usualArithmeticConversion(trueValue.type, falseValue.type);
            return;
        } else if (trueValue.type.equals(falseValue.type)) {
            this.type = trueValue.type;
            return;
        } else if (trueValue.type instanceof CPointer && falseValue.type instanceof CPointer) {
            // both pointers - check if either is void* pointer
            if (trueValue.type.type instanceof CVoid) {
                this.type = falseValue.type;
                return;
            } else if (falseValue.type.type instanceof CVoid) {
                this.type = trueValue.type;
                return;
            }
        } else if (trueValue.type instanceof CPointer || falseValue.type instanceof CPointer) {
            // one pointer - check if other null constant
            const otherValue = trueValue.type instanceof CPointer ? falseValue : trueValue;
            // eslint-disable-next-line eqeqeq
            if (otherValue instanceof CConstant && otherValue.value == 0) {
                this.type = trueValue.type instanceof CPointer ? trueValue.type : falseValue.type;
                return;
            }
        }
        throw new checks.ExpressionTypeError(node, "both conditional branches to have the same type", "different types");
    }

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.test.identifiers();
        yield* this.trueValue.identifiers();
        yield* this.falseValue.identifiers();
    }
}

export class CAssignment {
    readonly lvalue = false;
    readonly type: CType;

    // rhs may require casting
    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression | CInitializer,
                readonly assignmentType: pt.AssignmentType, readonly initialAssignment: boolean = false) {
        // check lvalue
        const lhsType = lhs.type instanceof CPointer ? (lhs.type.original ?? lhs.type) : lhs.type; // no pointer gen
        checks.checkLvalue(lhs, true);
        if ((lhsType instanceof CArray && !initialAssignment) || lhsType instanceof CFuncType || lhs.type.incomplete) {
            throw new checks.ExpressionTypeError(lhs.node, "assignable type");
        } else if (getQualifier(lhsType) === "const" && !initialAssignment) {
            throw new checks.ExpressionTypeError(lhs.node, "non-const location");
        } else if ((lhsType instanceof CStruct || lhsType instanceof CUnion) && lhsType.hasConstMember() && !initialAssignment) {
            throw new checks.ExpressionTypeError(lhs.node, "structure without a const member");
        }
        this.type = lhsType.pointerGeneration;

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
            CAssignment._checkAssignmentTypeValid(node, lhsType, rhsType);
        } else {
            CAssignment.checkAssignmentValid(node, lhsType, rhs);
        }
    }

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.lhs.identifiers();
        yield* this.rhs.identifiers();
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
        if (varType instanceof CArithmetic && valueType instanceof CArithmetic) {
            return; // arithmetic types always assignable
        }
        if (varType instanceof CPointer && valueType instanceof CPointer) {
            // void pointers can be assigned to any pointer and any pointer can be assigned to a void pointer
            if (varType.type instanceof CVoid || valueType.type instanceof CVoid) return;
            // allow non-constant pointers to be assigned to constant pointers
            if (varType.type.equals(valueType.type)) return;
        }
        if (varType instanceof CPointer && valueType instanceof CFuncType) {
            // implicit function pointer conversion
            if (varType.type.equals(valueType)) return;
        }
        if (valueType instanceof CPointer && valueType.original) {
            // pointer generation
            if (varType.equals(valueType.original)) return;

            if (varType instanceof CArray && valueType.original instanceof CArray && varType.type.equals(valueType.type)) {
                // allow assigning smaller arrays to larger ones
                if ((valueType.original.length ?? 0) < (varType.length ?? 0)) return;
            }
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

    *identifiers(): IterableIterator<CIdentifier> {
        yield* this.lhs.identifiers();
        yield* this.rhs.identifiers();
    }
}

/** Special type of expression permitted only in declarations */
export class CInitializer {
    private _type: CType;
    private _memberTypes: CType[] = [];

    constructor(readonly node: ParseNode, readonly body: (CExpression | CInitializer)[], type?: CType) {
        // default to a void* array which isn't the true type but lets the array size be used when declaring arrays
        this._type = type ?? new CArray(undefined, new CPointer(undefined, new CVoid()), body.length);
    }

    get memberTypes(): ReadonlyArray<CType> {
        return this._memberTypes;
    }

    get type(): CType {
        return this._type;
    }

    /** Once the initializer is recursively constructed and the declaration's type is known, set the type of the
     * initializer to the type of the declaration, checking that this initializer is valid for the provided type */
    set type(value: CType) {
        const error = () => {
            throw new checks.ExpressionTypeError(this.node, "initializer to match type");
        };
        this._memberTypes = [];

        if (value instanceof CArray) {
            if (this.body.length > (value.length ?? Infinity)) error(); // too many elements in this initializer
            for (let i = 0; i < this.body.length; i++) {
                this.body[i] = CInitializer.typeCheck(value.type, this.body[i]);
                this._memberTypes.push(value.type);
            }

        } else if (value instanceof CStruct) {
            if (this.body.length > value.members.length) error(); // too many members
            for (let i = 0; i < this.body.length; i++) {
                this.body[i] = CInitializer.typeCheck(value.members[i].type, this.body[i]);
                this._memberTypes.push(value.members[i].type);
            }

        } else if (value instanceof CUnion) {
            if (this.body.length > 1) error();
            // unions have to be initialized to the first member in the union
            if (this.body.length === 1) {
                this.body[0] = CInitializer.typeCheck(value.members[0].type, this.body[0]);
                this._memberTypes.push(value.members[0].type);
            }

        } else {
            error();
        }
        this._type = value;
    }

    *identifiers(): IterableIterator<CIdentifier> {
        for (const c of this.body) yield* c.identifiers();
    }

    private static typeCheck(desiredType: CType, expr: CExpression | CInitializer): CExpression | CInitializer {
        if (expr instanceof CInitializer) {
            expr.type = desiredType;
        } else {
            CAssignment.checkAssignmentValid(expr.node, desiredType, expr);

            if (expr instanceof CConstant && desiredType instanceof CArithmetic && expr.type !== desiredType) {
                expr = expr.changeType(desiredType);
            }
        }
        return expr;
    }
}
