import type {TypeSpecifier} from "../parsing/parsetree";
import type {CVariable} from "./declarations";

export type CType = CCompound | CArithmetic | CPointer | CArray;

export class CPointer {
    readonly typeName = "pointer";
    readonly bytes = 4;

    constructor(readonly type: CType, readonly constant: boolean = false) {
    }
}

export class CArray {
    readonly typeName = "array";

    constructor(readonly type: CType, readonly length: number) {
    }

    get bytes(): number {
        return this.type.bytes * this.length;
    }
}

export type CCompound = CStruct | CUnion | CEnum;

export class CStruct {
    readonly typeName = "struct";

    constructor(readonly children: CVariable[], readonly name?: string) {
    }

    get bytes(): number {
        return this.children.reduce((total, x) => total + x.type.bytes, 0);
    }

    memberType(m: string): CType {
        const member = this.children.find(x => x.name === m);
        if (member) return member.type;
        throw new Error(`Struct does not contain member ${member}`);
    }
}

export class CUnion {
    readonly typeName = "union";

    constructor(readonly children: CVariable[], readonly name?: string) {
    }

    get bytes(): number {
        return this.children.reduce((total, x) => Math.max(total, x.type.bytes), 0);
    }

    memberType(m: string): CType {
        const member = this.children.find(x => x.name === m);
        if (member) return member.type;
        throw new Error(`Union does not contain member ${member}`);
    }
}

export class CEnum {
    readonly typeName = "enum";
    readonly bytes = 4;

    constructor(readonly values: {name: string, value: number}[], readonly name?: string) {
    }
}

export class CArithmetic {
    readonly typeName = "arithmetic";

    private constructor(readonly name: string, readonly bytes: number, readonly type: "float" | "signed" | "unsigned") {
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

function getArithmeticType(specifierList: ReadonlyArray<TypeSpecifier & string>) {
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

    if (remove("double")) {
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
