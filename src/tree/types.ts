import type {TypeSpecifier, TypeQualifier} from "../parsing/parsetree";
import type {CVariable} from "./declarations";

export type CType = CNotFuncType | CFuncType;
export type CNotFuncType = CCompound | CArithmetic | CPointer | CArray | CVoid;
export type CQualifiedType<T extends CType> = T & {qualifier?: TypeQualifier};

export class CFuncType {
    readonly typeName = "function";
    readonly bytes = 0;
    readonly incomplete = false;

    constructor(readonly returnType: CQualifiedType<CNotFuncType>,
                readonly parameterTypes: CQualifiedType<CNotFuncType>[],
                public parameterNames?: string[]) {
        checkTypeComplete(returnType);
        parameterTypes.forEach(checkTypeComplete);
    }

    equals(t: Object): boolean {
        return t instanceof CFuncType
            && t.returnType.equals(this.returnType)
            && t.parameterTypes.length === this.parameterTypes.length
            && t.parameterTypes.every((other, i) => this.parameterTypes[i].equals(other));
    }
}

export class CPointer {
    readonly typeName = "pointer";
    readonly bytes = 4;
    readonly incomplete = false;

    constructor(readonly type: CType, readonly constant: boolean = false) {
        // allow pointers to incomplete types
    }

    equals(t: object): boolean {
        return t instanceof CPointer && t.constant === this.constant && this.type.equals(t.type);
    }
}

export class CArray {
    readonly typeName = "array";

    constructor(readonly type: CType, public length?: number) {
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

export class CStruct {
    readonly typeName = "struct";
    private _members: ReadonlyArray<CVariable> | undefined;

    constructor(readonly name: string | undefined) {
    }

    get members(): ReadonlyArray<CVariable> {
        if (this._members === undefined) throw new Error("Can't get members of an incomplete struct");
        return this._members;
    }

    set members(children: ReadonlyArray<CVariable>) {
        if (this._members !== undefined) throw new Error("Can't redefine a struct's members");
        if (children.length === 0) throw new Error("Struct must have one or more member");
        this._members = children;
    }

    get bytes(): number {
        if (this.incomplete) throw new Error("Tried to get size of incomplete type");
        return this.members.reduce((total, x) => total + x.type.bytes, 0);
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
        throw new Error(`Struct does not contain member ${member}`);
    }
}

export class CUnion {
    readonly typeName = "union";
    private _members: ReadonlyArray<CVariable> | undefined;

    constructor(readonly name: string | undefined) {
    }

    get members(): ReadonlyArray<CVariable> {
        if (this._members === undefined) throw new Error("Can't get members of an incomplete union");
        return this._members;
    }

    set members(children: ReadonlyArray<CVariable>) {
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
        throw new Error(`Union does not contain member ${member}`);
    }
}

export type CEnumValue = {name: string, value: number};
export class CEnum {
    readonly typeName = "enum";
    readonly bytes = 4;
    private _values: ReadonlyArray<CEnumValue> | undefined;

    constructor(readonly name: string | undefined) {
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
    readonly incomplete = false;

    equals(t: object): boolean {
        return t instanceof CVoid;
    }
}

export class CArithmetic {
    readonly typeName = "arithmetic";
    readonly incomplete = false;

    private constructor(readonly name: string, readonly bytes: number, readonly type: "float" | "signed" | "unsigned") {
    }

    equals(t: object): boolean {
        return t instanceof CArithmetic && t.type === this.type && t.bytes === this.bytes;
    }

    get minValue(): bigint | number {
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
    static readonly Fp64 = new CArithmetic("double", 4, "float");

    static readonly U8 = new CArithmetic("char", 1, "unsigned");
    static readonly S8 = new CArithmetic("signed char", 1, "signed");
    static readonly U16 = new CArithmetic("unsigned short", 2, "unsigned");
    static readonly S16 = new CArithmetic("short", 2, "signed");
    static readonly U32 = new CArithmetic("unsigned int", 4, "unsigned");
    static readonly S32 = new CArithmetic("int", 4, "signed");
    static readonly U64 = new CArithmetic("unsigned long", 8, "unsigned");
    static readonly S64 = new CArithmetic("long", 8, "signed");
}

export const CSizeT = CArithmetic.U32;

export function addQualifier<T extends CType>(t: T, qualifier?: TypeQualifier): CQualifiedType<T> {
    const newType = Object.assign({}, t, {qualifier});
    return Object.setPrototypeOf(newType, Object.getPrototypeOf(t));
}

export function getQualifier(t: CQualifiedType<CType>): TypeQualifier | undefined {
    return t?.qualifier;
}

export function integerPromotion(t: CArithmetic): CArithmetic {
    if (t.type === "float") return t;
    if (t.bytes < CArithmetic.S32.bytes) return CArithmetic.S32;
    return t;
}

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

export function getArithmeticType(specifierList: ReadonlyArray<TypeSpecifier & string>): CArithmetic | CVoid | undefined {
    const copy = specifierList.slice();

    function remove(s: TypeSpecifier & string) {
        const idx = copy.indexOf(s);
        if (idx > -1) {
            copy.splice(idx, 1);
            return true;
        }
        return false;
    }

    function check<T>(x: T): T | undefined {
        if (copy.length > 0) return undefined;
        return x;
    }

    if (remove("void")) {
        return check(new CVoid());
    } else if (remove("double")) {
        remove("long");
        return check(CArithmetic.Fp64);
    } else if (remove("float")) {
        return check(CArithmetic.Fp32);
    } else if (remove("char")) {
        if (remove("signed")) return check(CArithmetic.S8);
        remove("unsigned");
        return check(CArithmetic.U8);
    } else if (remove("short")) {
        remove("int");
        if (remove("unsigned")) return check(CArithmetic.U16);
        remove("signed");
        return check(CArithmetic.S16);
    } else if (remove("long")) {
        remove("long");
        remove("int");
        if (remove("unsigned")) return check(CArithmetic.U64);
        remove("signed");
        return check(CArithmetic.S64);
    } else if (remove("int")) {
        if (remove("unsigned")) return check(CArithmetic.U32);
        remove("signed");
        return check(CArithmetic.S32);
    }
    return undefined;
}

export function checkTypeComplete<T extends CType>(type: T): T {
    if (type.incomplete) {
        throw new class extends Error {
            name = "IncompleteTypeError";
        }("Invalid use of an incomplete type");
    }
    return type;
}
