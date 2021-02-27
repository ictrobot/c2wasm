import type {FunctionDefinition, ParseNode} from "../parsing/parsetree";
import type {CInitializer, CExpression} from "./expressions";
import type {Scope} from "./scope";
import {CCompoundStatement} from "./statements";
import type {CFuncType, CNotFuncType, CQualifiedType} from "./types";

// classes to represent all the different types of declarations in the IR
export type CDeclaration = CVariable | CFunction;
export type CVariable = CVarDeclaration | CVarDefinition | CArgument;
export type CFunction = CFuncDefinition | CFuncDeclaration;

export class CVarDeclaration {
    readonly declType = "variable";
    _addressUsed: boolean = false;
    _definition?: CVarDefinition;

    constructor(readonly node: ParseNode,
                readonly name: string,
                readonly type: CQualifiedType<CNotFuncType>,
                readonly storage: "static" | "local",
                readonly linkage: "none" | "internal" | "external") {
    }

    set addressUsed(b: boolean) {
        if (this._definition) this._definition.addressUsed ||= b;
        else this._addressUsed ||= b;
    }

    get addressUsed(): boolean {
        return this._definition ? this._definition.addressUsed : this._addressUsed;
    }

    set definition(v: CVarDefinition | undefined) {
        if (v === undefined) throw new Error("Cannot set definition to undefined");
        v.addressUsed ||= this._addressUsed;
        this._definition = v;
    }

    get definition(): CVarDefinition | undefined {
        return this._definition;
    }
}

export class CVarDefinition {
    readonly declType = "variable";
    staticValue?: CExpression | CInitializer;
    addressUsed: boolean = false;
    readonly dependencies = new Map<CDeclaration, boolean>(); // direct dependencies of initializer only

    constructor(readonly node: ParseNode,
                readonly name: string,
                readonly type: CQualifiedType<CNotFuncType>,
                readonly storage: "static" | "local",
                public linkage: "none" | "internal" | "external") {
    }
}

export class CArgument {
    readonly declType = "variable";
    readonly storage = "argument";
    readonly linkage = "none";
    addressUsed: boolean = false;

    constructor(readonly node: ParseNode,
                readonly name: string,
                readonly type: CQualifiedType<CNotFuncType>,
                readonly index: number) {
    }
}

export class CFuncDeclaration {
    readonly declType = "function";
    definition?: CFuncDefinition | CFuncImport;

    constructor(readonly node: ParseNode,
                readonly name: string,
                readonly type: CQualifiedType<CFuncType>,
                readonly linkage: "none" | "internal" | "external",
                public fnImport: boolean = false) {
    }
}

export class CFuncImport {
    readonly declType = "import";
    readonly node: ParseNode;

    constructor(readonly declaration: CFuncDeclaration) {
        this.node = declaration.node;
    }

    getFunction(): CFuncDeclaration {
        return this.declaration;
    }
}

export class CFuncDefinition {
    readonly declType = "function";
    readonly body: CCompoundStatement;
    readonly dependencies = new Map<CDeclaration, boolean>(); // direct dependencies only
    readonly hints: {inline: boolean} = {inline: false};

    constructor(readonly node: FunctionDefinition,
                readonly name: string,
                readonly type: CQualifiedType<CFuncType>,
                public linkage: "none" | "internal" | "external",
                readonly translationUnit: Scope) {
        this.body = new CCompoundStatement(node.body, this);
    }

    get scope(): Scope {
        return this.translationUnit;
    }

    equals(t: object): boolean {
        return t === this;
    }

    getFunction(): CFuncDefinition {
        return this;
    }
}
