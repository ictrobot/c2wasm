import type {StorageClass, TypeQualifier} from "../parsing/parsetree";
import type {Scope} from "./scope";
import type {CCompoundStatement} from "./statements";
import type {CType} from "./types";

export type CDeclaration = CVariable | CFunction;

export class CVariable {
    constructor(readonly name: string,
                readonly type: CType, readonly qualifier?: TypeQualifier, readonly storage?: StorageClass) {
    }

    get constant(): boolean {
        return this.qualifier === "const";
    }
}

export class CFunction {
    readonly typeName = "function";

    constructor(readonly name: string,
                readonly type: CType,
                readonly qualifier: TypeQualifier | undefined,
                readonly parameters: CParameter[],
                readonly body: CCompoundStatement,
                readonly translationUnit: Scope) {
    }

    get scope(): Scope {
        return this.translationUnit;
    }

    equals(t: object): boolean {
        return t === this;
    }
}

export class CParameter {
    constructor(readonly type: CType, readonly name?: string) {
    }
}
