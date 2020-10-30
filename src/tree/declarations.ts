import type {FunctionDefinition} from "../parsing/parsetree";
import type {StorageClass} from "../parsing/parsetree";
import type {CAssignment} from "./expressions";
import type {Scope} from "./scope";
import {CCompoundStatement} from "./statements";
import type {CFuncType, CNotFuncType, CQualifiedType} from "./types";

export type CDeclaration = CVariable | CArgument | CFuncDefinition | CFuncDeclaration;

export class CVariable {
    initial?: CAssignment;

    constructor(readonly name: string,
                readonly type: CQualifiedType<CNotFuncType>,
                readonly storage?: StorageClass) {
    }
}

export class CArgument {
    constructor(readonly name: string, readonly type: CQualifiedType<CNotFuncType>) {
    }
}

export class CFuncDeclaration {
    constructor(readonly name: string,
                readonly type: CQualifiedType<CFuncType>,
                readonly storage: StorageClass | undefined) {
    }
}

export class CFuncDefinition {
    readonly body: CCompoundStatement;

    constructor(readonly name: string,
                readonly type: CQualifiedType<CFuncType>,
                readonly storage: StorageClass | undefined,
                readonly node: FunctionDefinition,
                readonly translationUnit: Scope) {
        this.body = new CCompoundStatement(node.body, this);
    }

    get scope(): Scope {
        return this.translationUnit;
    }

    equals(t: object): boolean {
        return t === this;
    }
}
