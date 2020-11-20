import {CError} from "../c_error";
import type {TypeSpecifier, TypeQualifier, ParseNode} from "../parsing/parsetree";

// types for expressions and declarations in the IR
export type CType = CNotFuncType | CFuncType;
export type CNotFuncType = CCompound | CArithmetic | CPointer | CArray | CVoid;
export type CQualifiedType<T extends CType> = T & {qualifier?: TypeQualifier};

export class CFuncType {
    readonly typeName = "function";
    readonly bytes = 0;
    readonly incomplete = false;

    constructor(readonly node: ParseNode | undefined,
                readonly returnType: CQualifiedType<CNotFuncType>,
                readonly parameterTypes: CQualifiedType<CNotFuncType>[],
                public parameterNames?: string[],
                readonly variadic: boolean = false) {
        // return type and parameter types must be complete
        if (!(returnType instanceof CVoid)) checkTypeComplete(returnType);
        parameterTypes.forEach(x => checkTypeComplete(x));
    }

    equals(t: Object): boolean {
        return t instanceof CFuncType
            && t.returnType.equals(this.returnType)
            && t.parameterTypes.length === this.parameterTypes.length
            && t.parameterTypes.every((other, i) => this.parameterTypes[i].equals(other))
            && t.variadic === this.variadic;
    }
}

export class CPointer {
    readonly typeName = "pointer";
    readonly bytes = 4;
    readonly incomplete = false;
    readonly qualifier?: TypeQualifier;

    constructor(readonly node: ParseNode | undefined, readonly type: CType, constant: boolean = false) {
        // allow pointers to incomplete types
        if (constant) this.qualifier = "const";
    }

    equals(t: object): boolean {
        return t instanceof CPointer && t.qualifier === this.qualifier && this.type.equals(t.type);
    }
}

export class CArray {
    readonly typeName = "array";

    constructor(readonly node: ParseNode | undefined, readonly type: CType, public length?: number) {
        checkTypeComplete(type);
    }

    get bytes(): number {
        if (this.length === undefined) throw new Error("Tried to get size of incomplete type");
        return this.type.bytes * this.length;
    }

    get incomplete(): boolean {
        return this.length === undefined;
    }

    equals(t: object): boolean {
        return t instanceof CArray && t.length === this.length && this.type.equals(t.type);
    }
}

export type CCompound = CStruct | CUnion | CEnum;

export class CCompoundMember {
    constructor(readonly node: ParseNode, readonly name: string, readonly type: CQualifiedType<CNotFuncType>) {}
}

export class CStruct {
    readonly typeName = "struct";
    private _members: ReadonlyArray<CCompoundMember> | undefined;

    constructor(public node: ParseNode | undefined, readonly name: string | undefined) {
    }

    get members(): ReadonlyArray<CCompoundMember> {
        if (this._members === undefined) throw new Error("Can't get members of an incomplete struct");
        return this._members;
    }

    set members(children: ReadonlyArray<CCompoundMember>) {
        if (this._members !== undefined) throw new Error("Can't redefine a struct's members");
        if (children.length === 0) throw new Error("Struct must have one or more member");
        this._members = children;
    }

    get bytes(): number {
        if (this.incomplete) throw new Error("Tried to get size of incomplete type");
        return this.members.reduce((total, x) => total + (Math.ceil(x.type.bytes / 4) * 4), 0);
    }

    get incomplete(): boolean {
        return this._members === undefined;
    }

    equals(t: object): boolean {
        /** "Structures, unions and enumerations with different tags are distinct,
         * and a tagless union, structure, or enumeration specifies a unique type" */
        if (this.name === undefined) return this === t;
        return t instanceof CStruct && t.name === this.name;
    }

    memberType(m: string): CType {
        const member = this.members.find(x => x.name === m);
        if (member) return member.type;
        throw new Error(`Struct does not contain member "${m}"`);
    }

    hasConstMember(): boolean { // if the struct contains one or more const members
        return this.members.find(m =>
            getQualifier(m.type) || ((m.type instanceof CUnion || m.type instanceof CStruct) && m.type.hasConstMember())
        ) !== undefined;
    }
}

export class CUnion {
    readonly typeName = "union";
    private _members: ReadonlyArray<CCompoundMember> | undefined;

    constructor(public node: ParseNode | undefined, readonly name: string | undefined) {
    }

    get members(): ReadonlyArray<CCompoundMember> {
        if (this._members === undefined) throw new Error("Can't get members of an incomplete union");
        return this._members;
    }

    set members(children: ReadonlyArray<CCompoundMember>) {
        if (this._members !== undefined) throw new Error("Can't redefine a union's members");
        if (children.length === 0) throw new Error("Struct must have one or more member");
        this._members = children;
    }

    get bytes(): number {
        if (this.incomplete) throw new Error("Tried to get size of incomplete type");
        return this.members.reduce((total, x) => Math.max(total, x.type.bytes), 0);
    }

    get incomplete(): boolean {
        return this._members === undefined;
    }

    equals(t: object): boolean {
        if (this.name === undefined) return this === t;
        return t instanceof CUnion && t.name === this.name;
    }

    memberType(m: string): CType {
        const member = this.members.find(x => x.name === m);
        if (member) return member.type;
        throw new Error(`Union does not contain member "${m}"`);
    }

    hasConstMember(): boolean { // if the union has one or more const members
        return this.members.find(m =>
            getQualifier(m.type) || ((m.type instanceof CUnion || m.type instanceof CStruct) && m.type.hasConstMember())
        ) !== undefined;
    }
}

export type CEnumValue = {name: string, value: number};
export class CEnum {
    readonly typeName = "enum";
    readonly bytes = 4;
    private _values: ReadonlyArray<CEnumValue> | undefined;

    constructor(public node: ParseNode | undefined, readonly name: string | undefined) {
    }

    get values(): ReadonlyArray<CEnumValue> {
        if (this._values === undefined) throw new Error("Can't get values of an incomplete enum");
        return this._values;
    }

    set values(children: ReadonlyArray<CEnumValue>) {
        if (this._values !== undefined) throw new Error("Can't redefine an enum's values");
        if (children.length === 0) throw new Error("Enum must have one or more value");
        this._values = children;
    }

    get incomplete(): boolean {
        return this._values === undefined;
    }

    equals(t: object): boolean {
        if (this.name === undefined) return this === t;
        return t instanceof CEnum && t.name === this.name;
    }
}

export class CVoid {
    readonly typeName = "void";
    readonly bytes = 0;
    readonly incomplete = true;
    readonly node = undefined;

    equals(t: object): boolean {
        return t instanceof CVoid;
    }
}

export class CArithmetic {
    readonly typeName = "arithmetic";
    readonly incomplete = false;
    readonly node = undefined;

    private constructor(readonly name: string, readonly bytes: number, readonly type: "float" | "signed" | "unsigned") {
    }

    equals(t: object): boolean {
        return t instanceof CArithmetic && t.name === this.name && t.type === this.type && t.bytes === this.bytes;
    }

    get minValue(): bigint | number {
        if (CArithmetic.BOOL.equals(this)) return 0;

        switch (this.type) {
        case "float":
            return -Infinity;
        case "unsigned":
            return 0;
        case "signed":
            return -(2n ** (BigInt(this.bytes * 8) - 1n));
        }
    }

    get maxValue(): bigint | number {
        if (CArithmetic.BOOL.equals(this)) return 1;

        switch (this.type) {
        case "float":
            return Infinity;
        case "unsigned":
            return 2n ** BigInt(this.bytes * 8) - 1n;
        case "signed":
            return 2n ** (BigInt(this.bytes * 8) - 1n) - 1n;
        }
    }

    static readonly Fp32 = new CArithmetic("float", 4, "float");
    static readonly Fp64 = new CArithmetic("double", 8, "float");

    static readonly U8 = new CArithmetic("char", 1, "unsigned");
    static readonly S8 = new CArithmetic("signed char", 1, "signed");
    static readonly U16 = new CArithmetic("unsigned short", 2, "unsigned");
    static readonly S16 = new CArithmetic("short", 2, "signed");
    static readonly U32 = new CArithmetic("unsigned int", 4, "unsigned");
    static readonly S32 = new CArithmetic("int", 4, "signed");
    static readonly U64 = new CArithmetic("unsigned long", 8, "unsigned");
    static readonly S64 = new CArithmetic("long", 8, "signed");

    static readonly BOOL = new CArithmetic("bool", 4, "unsigned");
}

export const CSizeT = CArithmetic.U32;


const constType = Symbol("const"); // hidden property key

/**
 * Add a qualifier to a type.
 *
 * This creates a new object with the qualifier attached, using the existing type as its prototype, allowing it to be
 * treated as the existing type. This new object is also cached on the existing type using a field referenced by a
 * symbol, so it can't be accessed when enumerating the fields and doesn't affect existing code.
 */
export function addQualifier<T extends CType>(t: T, qualifier?: TypeQualifier): CQualifiedType<T> {
    if (qualifier === undefined) return t;
    if (Object.prototype.hasOwnProperty.call(t, "qualifier")) {
        throw new Error("Type already has a qualifier");
    }

    const baseType = t as Record<typeof constType, any>;
    if (baseType[constType]) {
        // const type already exists
        return baseType[constType];
    }

    const type = Object.setPrototypeOf({qualifier, _base: t}, t);
    baseType[constType] = type;
    return type;
}

export function getQualifier(t: CQualifiedType<CType>): TypeQualifier | undefined {
    return t?.qualifier;
}

/** integer promotion from the C standard */
export function integerPromotion(t: CArithmetic): CArithmetic {
    if (t.type === "float") return t;
    if (t.bytes < CArithmetic.S32.bytes || t === CArithmetic.BOOL) return CArithmetic.S32;
    return t;
}

/** "The usual arithmetic conversions" from the C standard */
export function usualArithmeticConversion(t1: CArithmetic, t2: CArithmetic): CArithmetic {
    if (t1 === CArithmetic.Fp64 || t2 === CArithmetic.Fp64) return CArithmetic.Fp64;
    if (t1 === CArithmetic.Fp32 || t2 === CArithmetic.Fp32) return CArithmetic.Fp32;

    // integer promotion
    t1 = integerPromotion(t1);
    t2 = integerPromotion(t2);

    if (t1 === CArithmetic.U64 || t2 === CArithmetic.U64) return CArithmetic.U64;
    if (t1 === CArithmetic.S64 || t2 === CArithmetic.S64) return CArithmetic.S64;
    if (t1 === CArithmetic.U32 || t2 === CArithmetic.U32) return CArithmetic.U32;
    return CArithmetic.S32;
}

/** Convert a list of specifier strings (e.g. "signed", "int") into a CType instance. */
export function getArithmeticType(specifierList: ReadonlyArray<TypeSpecifier & string>): CArithmetic | CVoid | undefined {
    const copy = specifierList.slice();

    function remove(s: TypeSpecifier & string) { // remove an item from a list if present, and return whether it was
        const idx = copy.indexOf(s);
        if (idx > -1) {
            copy.splice(idx, 1);
            return true;
        }
        return false;
    }

    function check<T>(x: T): T | undefined { // check that there are no specifiers left to be processed
        if (copy.length > 0) return undefined; // extra specifiers so this type is invalid (e.g. "unsigned signed int")
        return x;
    }

    if (remove("void")) { // if "void" in list
        return check(new CVoid()); // then the type must be void, check no extra specifiers were provided
    } else if (remove("double")) {
        remove("long"); // remove "long" if present, as treating "long double" as normal doubles
        return check(CArithmetic.Fp64);
    } else if (remove("float")) {
        return check(CArithmetic.Fp32);
    } else if (remove("char")) {
        if (remove("signed")) return check(CArithmetic.S8);
        remove("unsigned");
        return check(CArithmetic.U8);
    } else if (remove("short")) {
        remove("int"); // remove optional "int" ("short int" === "int")
        if (remove("unsigned")) return check(CArithmetic.U16);
        remove("signed");
        return check(CArithmetic.S16);
    } else if (remove("long")) {
        remove("long"); // remove an 2nd "long" if present, as treating "long long" as "long"
        remove("int");
        if (remove("unsigned")) return check(CArithmetic.U64);
        remove("signed");
        return check(CArithmetic.S64);
    } else if (remove("int")) {
        if (remove("unsigned")) return check(CArithmetic.U32);
        remove("signed");
        return check(CArithmetic.S32);
    } else if (remove("unsigned")) { // support just `unsigned` and `signed`
        return check(CArithmetic.U32);
    } else if (remove("signed")) {
        return check(CArithmetic.S32);
    } else if (remove("bool")) {
        return check(CArithmetic.BOOL);
    }
    return undefined;
}

/** Assert that type is complete */
export function checkTypeComplete<T extends CType>(type: T, node: ParseNode | undefined = type.node): T {
    if (type.incomplete) {
        throw new class extends CError {
            name = "IncompleteTypeError";
        }("Invalid use of an incomplete type", node);
    }
    return type;
}
