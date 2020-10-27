import type {StorageClass, TypeQualifier} from "../parsing/parsetree";
import type {CStatement} from "./statements";
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
    constructor(readonly name: string,
                readonly type: CType,
                readonly qualifier: TypeQualifier | undefined,
                readonly parameters: CParameter[],
                readonly body: CStatement) {
    }
}

export class CParameter {
    constructor(readonly type: CType, readonly name?: string) {
    }
}
