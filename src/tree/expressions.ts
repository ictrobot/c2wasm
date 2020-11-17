import type {ParseNode, pt} from "../parsing";
import {CVarDefinition} from "./declarations";
import type {CDeclaration, CVariable, CArgument} from "./declarations";
import * as checks from "./type_checking";
import {
    CArithmetic, CType, CArray, CPointer, CUnion, CStruct,
    CSizeT, usualArithmeticConversion, integerPromotion, CFuncType, CVoid, CEnum, checkTypeComplete, getQualifier
} from "./types";

// Classes to represent all the possible expression types in the IR

export type CExpression =
    CConstant | CIdentifier | CArrayPointer | CStringLiteral |
    CFunctionCall | CMemberAccess | CIncrDecr | // postfix
    CAddressOf | CDereference | CUnaryPlusMinus | CBitwiseNot | CLogicalNot | CSizeof | // unary
    CCast |
    CMulDiv | CMod | CAddSub | CShift |
    CRelational | CEquality |
    CBitwiseAndOr | CLogicalAndOr |
    CConditional | CAssignment | CComma;

/** if the expression can be evaluated to a constant at compile time, extend this class.
 * Used for integer constants for enum values, switch statements, static initializers, etc */
export abstract class CEvaluable {
    abstract evaluate(): CConstant | undefined;
}

export class CConstant extends CEvaluable {
    readonly lvalue = false;

    constructor(readonly node: ParseNode, readonly type: CArithmetic | CEnum, readonly value: bigint | number) {
        super();
    }

    changeType(type: CArithmetic): CConstant {
        if (this.type.equals(type)) return this;

        let newValue: bigint | number;
        if (type.type === "float") {
            newValue = Number(this.value);
        } else {
            if (this.value > type.maxValue || this.value < type.minValue) {
                throw new checks.ExpressionTypeError(this.node, `value which fits in ${type.name}`, this.value.toString());
            }
            newValue = BigInt(this.value);
        }
        return new CConstant(this.node, type, newValue);
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

    evaluate(): CConstant | undefined {
        // only constant if points to an enum identifier
        if (this.value.type.typeName === "enum" && (this.value as CVarDefinition).staticValue instanceof CConstant) {
            return (this.value as CVarDefinition).staticValue as CConstant;
        }
        return undefined;
    }
}

/**
 * Array identifiers are used as pointers to arrays everywhere excluding:
 * - the unary & operator
 * - the sizeof operator
 */
export class CArrayPointer {
    readonly lvalue = false;
    readonly type: CPointer;

    constructor(readonly node: ParseNode, readonly arrayIdentifier: CIdentifier | CStringLiteral) {
        if (!(arrayIdentifier.type instanceof CArray)) {
            throw new checks.ExpressionTypeError(this.node, "array");
        }
        this.type = new CPointer(this.node, arrayIdentifier.type.type);
    }
}

export class CStringLiteral {
    readonly lvalue = false;
    readonly type: CArray;

    constructor(readonly node: ParseNode, readonly value: bigint[]) {
        // currently only supports UTF8
        if (value.length === 0 || value[value.length - 1] !== 0n) {
            throw new checks.ExpressionTypeError(node, "null terminated char[]", "char[]");
        }
        this.type = new CArray(node, CArithmetic.U8, value.length);
    }

    toInitializer(): CInitializer {
        // convert to an array of chars
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
}

export class CMemberAccess {
    readonly lvalue: boolean;
    readonly structUnion: CStruct | CUnion;
    readonly type: CType;

    /** transform `e.member` to `(&e)->member` before calling */
    constructor(readonly node: ParseNode, readonly body: CExpression, readonly member: string) {
        const pointerType = checks.asPointer(body.node, body.type);
        this.structUnion = checks.asStructOrUnion(body.node, pointerType.type);
        this.type = this.structUnion.memberType(member);
        this.lvalue = !(this.type instanceof CArray);
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

export class CSizeof extends CEvaluable {
    readonly lvalue = false;
    readonly type = CSizeT;

    constructor(readonly node: ParseNode, readonly body: CType) {
        super();
        if (body.incomplete || body.bytes === 0 || body instanceof CFuncType) {
            throw new checks.ExpressionTypeError(node, "Complete non-function type", body.typeName);
        }
    }

    evaluate(): CConstant {
        return new CConstant(this.node, CSizeT, this.body.bytes);
    }
}

export class CAddressOf { // &
    readonly lvalue = false;
    readonly type: CPointer;
    readonly body: CExpression;

    constructor(readonly node: ParseNode, body: CExpression) {
        if (body instanceof CArrayPointer) body = body.arrayIdentifier;
        checks.checkLvalue(body, true);
        this.type = new CPointer(node, checks.asCType(body));

        if (body instanceof CIdentifier) {
            // when translating to wasm all variables which have their address taken have to be stored on the shadow stack
            (body.value as CVariable | CArgument).addressUsed = true;
        }
        this.body = body;
    }
}

export class CDereference { // * or 'indirection'
    readonly lvalue = true;
    readonly type: CType;

    constructor(readonly node: ParseNode, readonly body: CExpression) {
        this.type = checks.asPointer(node, body.type).type;
    }
}

export class CUnaryPlusMinus extends CEvaluable {
    readonly lvalue = false;
    readonly type: CArithmetic;
    readonly bodyType: CArithmetic;

    constructor(readonly node: ParseNode, readonly body: CExpression, readonly op: "+" | "-") {
        super();
        this.bodyType = checks.asArithmetic(body.node, body.type);
        this.type = integerPromotion(this.bodyType);
    }

    evaluate(): CConstant | undefined {
        const body = (this.body as CEvaluable)?.evaluate();
        if (body && this.bodyType.type !== "unsigned") return new CConstant(this.node, this.bodyType, -body.value);
        return undefined;
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
    readonly commonType: CArithmetic;

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression, readonly op: "LT" | "GT" | "LEq" | "GEq") {
        checks.asArithmeticOrPointer(lhs.node, lhs.type);
        checks.asArithmeticOrPointer(rhs.node, rhs.type);

        this.commonType = usualArithmeticConversion(
            lhs.type instanceof CArithmetic ? lhs.type : CSizeT,
            rhs.type instanceof CArithmetic ? rhs.type : CSizeT);
    }
}

export class CEquality {
    readonly lvalue = false;
    readonly type = CArithmetic.S32;
    readonly commonType: CArithmetic;

    constructor(readonly node: ParseNode, readonly lhs: CExpression, readonly rhs: CExpression, readonly op: "==" | "!=") {
        checks.asArithmeticOrPointer(lhs.node, lhs.type);
        checks.asArithmeticOrPointer(rhs.node, rhs.type);

        this.commonType = usualArithmeticConversion(
            lhs.type instanceof CArithmetic ? lhs.type : CSizeT,
            rhs.type instanceof CArithmetic ? rhs.type : CSizeT);
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

export class CConditional { // [test] ? [trueValue] : [falseValue]
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
        if ((lhs.type instanceof CArray && !initialAssignment) || lhs.type instanceof CFuncType || lhs.type.incomplete) {
            throw new checks.ExpressionTypeError(lhs.node, "assignable type");
        } else if (getQualifier(lhs.type) === "const" && !initialAssignment) {
            throw new checks.ExpressionTypeError(lhs.node, "non-const location");
        } else if ((lhs.type instanceof CStruct || lhs.type instanceof CUnion) && lhs.type.hasConstMember() && !initialAssignment) {
            throw new checks.ExpressionTypeError(lhs.node, "structure without a const member");
        }
        this.type = lhs.type;

        // fix string constants being wrapped into pointers
        if (lhs.type instanceof CArray && rhs instanceof CArrayPointer) this.rhs = rhs = rhs.arrayIdentifier;

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
    private _memberTypes: CType[] = [];

    constructor(readonly node: ParseNode, readonly body: (CExpression | CInitializer)[], type?: CType) {
        // default to a void* array which isn't the true type but lets the array size be used when declaring arrays
        this._type = type ?? new CArray(undefined, new CPointer(undefined, new CVoid()), body.length);

        // convert string literals to list initializers
        for (let i = 0; i < body.length; i++) {
            const value = body[i];
            if (value instanceof CArrayPointer && value.arrayIdentifier instanceof CStringLiteral) {
                this.body[i] = value.arrayIdentifier.toInitializer();
            }
        }
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

    /** If this is a static initializer, recursively check that the body is evaluable at compile time */
    asStatic(): this {
        for (let i = 0; i < this.body.length; i++) {
            const child = this.body[i];
            if (child instanceof CInitializer) {
                child.asStatic();
            } else if (child instanceof CEvaluable) {
                const value = child.evaluate();
                if (value === undefined) throw new checks.ExpressionTypeError(child.node, "constant expression");
                this.body[i] = value.changeType(this._memberTypes[i] as CArithmetic);
            } else {
                throw new checks.ExpressionTypeError(child.node, "constant expression");
            }
        }
        return this;
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
