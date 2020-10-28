import type {TypeSpecifier} from "../parsing/parsetree";
import type {CVariable} from "./declarations";

export type CType = CCompound | CArithmetic | CPointer | CArray;

export class CPointer {
    readonly bytes = 4;

    constructor(readonly type: CType, readonly constant: boolean = false) {
    }
}

export class CArray {
    constructor(readonly type: CType, readonly length: number) {
    }

    get bytes(): number {
        return this.type.bytes * this.length;
    }
}

export type CCompound = CStruct | CUnion | CEnum;

export class CStruct {
    constructor(readonly children: CVariable[], readonly name?: string) {
    }

    get bytes(): number {
        return this.children.reduce((total, x) => total + x.type.bytes, 0);
    }
}

export class CUnion {
    constructor(readonly children: CVariable[], readonly name?: string) {
    }

    get bytes(): number {
        return this.children.reduce((total, x) => Math.max(total, x.type.bytes), 0);
    }
}

export class CEnum {
    readonly bytes = 4;

    constructor(readonly values: {name: string, value: number}[], readonly name?: string) {
    }
}

export interface CArithmetic {
    readonly name: string;
    readonly bytes: number;
    readonly type: "float" | "signed" | "unsigned";
}

export const Fp32: CArithmetic = {
    name: "float",
    bytes: 4,
    type: "float"
};

export const Fp64: CArithmetic = {
    name: "double",
    bytes: 8,
    type: "float"
};

export const U8: CArithmetic = {
    name: "char",
    bytes: 1,
    type: "unsigned"
};

export const S8: CArithmetic = {
    name: "signed char",
    bytes: 1,
    type: "signed"
};

export const U16: CArithmetic = {
    name: "unsigned short",
    bytes: 2,
    type: "unsigned"
};

export const S16: CArithmetic = {
    name: "short",
    bytes: 2,
    type: "signed"
};

export const U32: CArithmetic = {
    name: "unsigned int",
    bytes: 4,
    type: "unsigned"
};

export const S32: CArithmetic = {
    name: "int",
    bytes: 4,
    type: "signed"
};

export const U64: CArithmetic = {
    name: "unsigned long",
    bytes: 8,
    type: "unsigned"
};

export const S64: CArithmetic = {
    name: "long",
    bytes: 8,
    type: "signed"
};

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
        return check(Fp64);
    } else if (remove("float")) {
        return check(Fp32);
    } else if (remove("char")) {
        if (remove("signed")) return check(S8);
        remove("unsigned");
        return check(U8);
    } else if (remove("short")) {
        remove("int");
        if (remove("unsigned")) return check(U16);
        remove("signed");
        return check(S16);
    } else if (remove("long")) {
        remove("long");
        remove("int");
        if (remove("unsigned")) return check(U64);
        remove("signed");
        return check(S64);
    } else if (remove("int")) {
        if (remove("unsigned")) return check(U32);
        remove("signed");
        return check(S32);
    }
    return undefined;
}
