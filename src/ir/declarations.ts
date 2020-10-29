import type {StorageClass} from "../parsing/parsetree";
import type {CAssignment} from "./expressions";
import type {Scope} from "./scope";
import type {CCompoundStatement} from "./statements";
import type {CFuncType, CNotFuncType, CQualifiedType} from "./types";

export type CDeclaration = CVariable | CFunction;

export class CVariable {
    initial?: CAssignment;

    constructor(readonly name: string,
                readonly type: CQualifiedType<CNotFuncType>,
                readonly storage?: StorageClass) {
    }
}

export class CFunction {
    constructor(readonly name: string,
                readonly type: CQualifiedType<CFuncType>,
                readonly storage: StorageClass | undefined,
                readonly parameterNames: string[],
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
