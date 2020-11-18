import {CError} from "./c_error";
import {ParseNode} from "./parsing";
import {Preprocessor} from "./preprocessor";
import {toIR} from "./tree";
import {CFuncDefinition, CFuncDeclaration, CVarDeclaration, CVarDefinition} from "./tree/declarations";
import {Scope} from "./tree/scope";
import {CStatement, CCompoundStatement, CForLoop, CIf, CWhileLoop, CDoLoop, CSwitch} from "./tree/statements";

export class Linker {
    private _emitFunctions: CFuncDefinition[] = []; // all functions to be emitted
    private _emitImports: CFuncDeclaration[] = []; // all the function imports to be emitted
    private _emitVariables: CVarDefinition[] = []; // all static-storage variables to be emitted

    private _linkables = new Map<string, ExternalFunction | ExternalVariable>();
    private _linked = false;

    constructor(readonly files: ReadonlyMap<string, string>, standardHeaders: boolean = true) {
        for (const code of files.values()) {
            const preprocessor = new Preprocessor(standardHeaders);
            for (const [p2, c2] of files.entries()) preprocessor.userFiles.set(p2, c2);
            const processed = preprocessor.process(code);
            this.process_scope(toIR(processed));
        }
    }

    /** check complete or link with other linker */
    public link(other?: Linker): void {
        let usedOther = false;

        for (const linkable of this._linkables.values()) {
            if (linkable.definition !== undefined) continue; // we've got a definition

            if (other !== undefined) {
                const linkable2 = other._linkables.get(linkable.id);
                if (linkable2 !== undefined) {
                    if (linkable.externalType !== linkable2.externalType) {
                        throw new LinkingError(`Tried to link ${linkable.externalType} with ${linkable2.externalType}`, linkable.parseNode, linkable2.parseNode);
                    } else if (!linkable.type.equals(linkable2.type)) {
                        throw new LinkingError("Tried to link incompatible types", linkable.parseNode, linkable2.parseNode);
                    }

                    // we've found a definition in the other unit we can use!
                    usedOther = true;
                    this._linkables.set(linkable.id, linkable2);
                    for (const element of linkable.declarationArray) {
                        linkable2.addDeclaration(element as any);
                    }
                    continue;
                }
            }

            if (linkable.externalType === "variable") {
                // each external variable declaration is also a tentative definition, so initialize to zero
                const cvar = new CVarDefinition(linkable.parseNode, linkable.id, linkable.type, "static", "external");
                linkable.setDefinition(cvar);
                this._emitVariables.push(cvar);
                continue;
            } else if (linkable.externalType === "function") {
                // check if any of the declarations marked as "import"
                if (linkable.declarationArray.some(x => x.fnImport)) {
                    // import this function instead
                    this._emitImports.push(linkable.declarationArray[0]);
                    continue;
                }
            }

            throw new LinkingError("Failed to find definition", linkable.parseNode);
        }

        if (usedOther && other) {
            // need to add all its functions and variables to the lists to be emitted
            this._emitVariables.push(...other._emitVariables);
            this._emitImports.push(...other._emitImports);
            this._emitFunctions.push(...other._emitFunctions);
        }

        this._linked = true;
    }

    get emitFunctions(): ReadonlyArray<CFuncDefinition> {
        return this._emitFunctions;
    }

    get emitImports(): ReadonlyArray<CFuncDeclaration> {
        return this._emitImports;
    }

    get emitVariables(): ReadonlyArray<CVarDefinition> {
        return this._emitVariables;
    }

    private process_scope(scope: Scope) {
        for (const decl of scope.declarations) {

            if (decl instanceof CFuncDeclaration) {
                if (decl.linkage === "external") {
                    this.externalFn(decl).addDeclaration(decl);
                } else {
                    throw new LinkingError("No definition of internally linked function", decl.node);
                }

            } else if (decl instanceof CFuncDefinition) {
                if (decl.linkage === "external") {
                    this.externalFn(decl).setDefinition(decl);
                }
                this._emitFunctions.push(decl);
                this.process_fn_body(decl.body);

            } else if (decl instanceof CVarDeclaration) { // "tentative definition" - if no def found initialize to 0
                if (decl.linkage === "external") {
                    this.externalVar(decl).addDeclaration(decl);
                } else {
                    // tentative definition with internal linkage
                    decl.definition = new CVarDefinition(decl.node, decl.name, decl.type, decl.storage, decl.linkage);
                    this._emitVariables.push(decl.definition);
                }

            } else if (decl instanceof CVarDefinition) {
                if (decl.linkage === "external") {
                    this.externalVar(decl).setDefinition(decl);
                }
                if (decl.storage === "static") {
                    this._emitVariables.push(decl);
                }

            }
        }
    }

    private process_fn_body(statement: CStatement) {
        // find all scopes

        if (statement instanceof CCompoundStatement) {
            this.process_scope(statement.scope);
            for (const child of statement.statements) this.process_fn_body(child);
        } else if (statement instanceof CForLoop) {
            this.process_scope(statement.scope);
            if (statement.body) this.process_fn_body(statement.body);
        } else if (statement instanceof CIf) {
            if (statement.ifBody) this.process_fn_body(statement.ifBody);
        } else if (statement instanceof CWhileLoop || statement instanceof CDoLoop) {
            if (statement.body) this.process_fn_body(statement.body);
        } else if (statement instanceof CSwitch) {
            for (const child of statement.children) this.process_fn_body(child.body);
        }
    }

    private externalFn(node: CFuncDeclaration | CFuncDefinition): ExternalFunction {
        let result = this._linkables.get(node.name);
        if (result === undefined) {
            this._linkables.set(node.name, result = new ExternalFunction(node.name, node.type));
        } else if (result instanceof ExternalVariable) {
            throw new LinkingError("Tried to link function with variable", node.node, result.parseNode);
        } else if (!result.type.equals(node.type)) {
            throw new LinkingError("Tried to link functions with incompatible types", node.node, result.parseNode);
        }
        return result;
    }

    private externalVar(node: CVarDeclaration | CVarDefinition): ExternalVariable {
        let result = this._linkables.get(node.name);
        if (result === undefined) {
            this._linkables.set(node.name, result = new ExternalVariable(node.name, node.type));
        } else if (result instanceof ExternalFunction) {
            throw new LinkingError("Tried to link variable with function", node.node, result.parseNode);
        } else if (!result.type.equals(node.type)) {
            throw new LinkingError("Tried to link variables with incompatible types", node.node, result.parseNode);
        }
        return result;
    }
}

class Linkable<Decl extends CVarDeclaration | CFuncDeclaration> {
    private readonly declarations: Decl[] = [];
    private _definition?: Decl["definition"];

    constructor(readonly id: string, readonly type: Decl["type"]) {

    }

    addDeclaration(d: Decl) {
        this.declarations.push(d);
        if (this._definition) d.definition = this._definition;
    }

    setDefinition(d: Decl["definition"] & {}) {
        if (this._definition !== undefined) {
            throw new LinkingError("Already defined!", d.node, this.parseNode);
        }
        this._definition = d;

        this.declarations.forEach(x => {
            x.definition = d;
        });
    }

    get parseNode(): ParseNode {
        if (this._definition) return this._definition.node;
        if (this.declarations.length > 0) return this.declarations[0].node;
        throw new LinkingError("Linkable without parse node? This shouldn't happen!");
    }

    get definition(): Decl["definition"] {
        return this._definition;
    }

    get declarationArray(): ReadonlyArray<Decl> {
        return this.declarations;
    }
}

class ExternalFunction extends Linkable<CFuncDeclaration> {
    readonly externalType = "function";
}

class ExternalVariable extends Linkable<CVarDeclaration> {
    readonly externalType = "variable";
}

class LinkingError extends CError {
    name = "LinkingError";
}
