import type {FunctionDefinition, ParseNode, StorageClass} from "../parsing/parsetree";
import type {CInitializer, CArrayPointer} from "./expressions";
import type {CConstant} from "./expressions";
import type {Scope} from "./scope";
import {CCompoundStatement} from "./statements";
import type {CFuncType, CNotFuncType, CQualifiedType} from "./types";

// classes to represent all the different types of declarations in the IR
export type CDeclaration = CVariable | CArgument | CFuncDefinition | CFuncDeclaration;

export class CVariable {
    staticValue?: CConstant | CInitializer | CArrayPointer;
    addressUsed: boolean = false;
    definition?: CVariable; // if this is extern

    constructor(readonly node: ParseNode,
                readonly name: string,
                readonly type: CQualifiedType<CNotFuncType>,
                readonly storage?: StorageClass) {
    }
}

export class CArgument {
    addressUsed: boolean = false;

    constructor(readonly node: ParseNode, readonly name: string, readonly type: CQualifiedType<CNotFuncType>, readonly index: number) {
    }
}

export class CFuncDeclaration {
    definition?: CFuncDefinition;

    constructor(readonly node: ParseNode,
                readonly name: string,
                readonly type: CQualifiedType<CFuncType>,
                readonly storage: StorageClass | undefined) {
    }
}

export class CFuncDefinition {
    readonly body: CCompoundStatement;

    constructor(readonly node: FunctionDefinition,
                readonly name: string,
                readonly type: CQualifiedType<CFuncType>,
                readonly storage: StorageClass | undefined,
                readonly translationUnit: Scope) {
        if (type.variadic) throw new Error("Cannot define variadic functions");
        this.body = new CCompoundStatement(node.body, this);
    }

    get scope(): Scope {
        return this.translationUnit;
    }

    equals(t: object): boolean {
        return t === this;
    }
}
