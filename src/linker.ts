import {CError} from "./c_error";
import {ParseNode} from "./parsing";
import {Preprocessor} from "./preprocessor";
import {toIR} from "./tree";
import {CFuncDefinition, CFuncDeclaration, CVarDeclaration, CVarDefinition, CFuncImport, CDeclaration, CArgument} from "./tree/declarations";
import {Scope} from "./tree/scope";
import {CStatement, CCompoundStatement, CForLoop, CIf, CWhileLoop, CDoLoop, CSwitch} from "./tree/statements";

type Emitable = CFuncDefinition | CFuncImport | CVarDefinition;

export class Linker {
    private _emitExportedFunctions: CFuncDefinition[] = [];
    private _emitFunctions: CFuncDefinition[] = [];
    private _emitImports: CFuncDeclaration[] = [];
    private _emitVariables: CVarDefinition[] = [];

    private _linkables = new Map<string, ExternalFunction | ExternalVariable>();
    private _linked = false;

    constructor(readonly files: ReadonlyMap<string, string>, standardHeaders: boolean = true, customDefinitions?: {[key: string]: string}) {
        for (const [path, code] of files.entries()) {
            if (!path.endsWith(".c")) continue;

            const preprocessor = new Preprocessor(path, standardHeaders, customDefinitions);
            for (const [p2, c2] of files.entries()) preprocessor.userFiles.set(p2, c2);
            const processed = preprocessor.process(code);
            try {
                this.process_scope(toIR(processed));
            } catch (e) {
                e.message = (e.message ?? "") + "\nIn file: " + path;
                throw e;
            }
        }
    }

    /** check complete or link with other linker */
    public link(other?: Linker): void {
        if (this._linked) throw new LinkingError("Already linked!");
        if (other && !other._linked) throw new LinkingError("Cannot link against not-linked Linker!");

        // link this with other
        for (const linkable of this._linkables.values()) {
            if (linkable.definition !== undefined) continue; // we've got a definition

            if (other !== undefined) {
                const linkable2 = other._linkables.get(linkable.id);
                if (linkable2 !== undefined && linkable2.definition) {
                    if (linkable instanceof ExternalFunction && linkable2 instanceof ExternalFunction) {
                        // we've found a definition in the other linker we can use!
                        linkable.setDefinition(linkable2.definition, other);
                    } else if (linkable instanceof ExternalVariable && linkable2 instanceof ExternalVariable) {
                        // have to be separate branches to please TS
                        linkable.setDefinition(linkable2.definition, other);
                    } else {
                        throw new LinkingError("Tried to link incompatible types", linkable.parseNode, linkable2.parseNode);
                    }
                    continue;
                }
            }

            if (linkable.externalType === "variable") {
                // each external variable declaration is also a tentative definition, so initialize to zero
                const cvar = new CVarDefinition(linkable.parseNode, linkable.id, linkable.type, "static", "external");
                linkable.setDefinition(cvar, this);
                continue;
            } else if (linkable.externalType === "function" && linkable.declarationArray[0].fnImport) {
                // define the function import if didn't already exist in other linker
                linkable.setDefinition(new CFuncImport(linkable.declarationArray[0]), this);
                continue;
            }

            throw new LinkingError("Failed to find definition", linkable.parseNode);
        }

        // now work out which functions and imports to emit
        const seen = new Map<Emitable, boolean>();
        const toEmit: Emitable[] = [];
        for (const linkable of this._linkables.values()) {
            if (linkable.definition === undefined) {
                throw new LinkingError("Invalid state - declaration has no definition in emit", linkable.parseNode);
            } else if (linkable.definitionLinker === this) {
                seen.set(linkable.definition, true);
                toEmit.unshift(linkable.definition);
            }
        }

        while (toEmit.length) {
            const dependency = toEmit.shift() as Emitable;
            if (dependency instanceof CFuncImport) {
                this._emitImports.push(dependency.declaration);
            } else {
                if (dependency.declType === "variable") {
                    if (dependency.storage === "static") this._emitVariables.push(dependency);
                } else if (dependency.linkage === "external" && this._linkables.get(dependency.name)?.definitionLinker === this) {
                    this._emitExportedFunctions.push(dependency);
                } else {
                    this._emitFunctions.push(dependency);
                }

                for (const dep2 of dependency.dependencies.keys() as IterableIterator<CDeclaration>) {
                    if (dep2 instanceof CFuncDeclaration || dep2 instanceof CVarDeclaration) {
                        if (dep2.node.type === "__internal__") {
                            // not a real function! __wasm__ etc
                        } else if (dep2.definition === undefined) {
                            throw new LinkingError("Invalid state - declaration doesn't have definition in emit", dep2.node);
                        } else if (!seen.has(dep2.definition)) {
                            seen.set(dep2.definition, true);
                            toEmit.push(dep2.definition);
                        }
                    } else if (!(dep2 instanceof CArgument) && !seen.has(dep2)) {
                        seen.set(dep2, true);
                        toEmit.push(dep2);
                    }
                }
            }
        }

        this._linked = true;
    }

    get emitExportedFunctions(): ReadonlyArray<CFuncDefinition> {
        return this._emitExportedFunctions;
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
                } else if (decl.fnImport) {
                    decl.definition = new CFuncImport(decl);
                } else {
                    throw new LinkingError("No definition of internally linked function", decl.node);
                }

            } else if (decl instanceof CFuncDefinition) {
                if (decl.linkage === "external") {
                    this.externalFn(decl).setDefinition(decl, this);
                }
                this.process_fn_body(decl.body);

            } else if (decl instanceof CVarDeclaration) { // "tentative definition" - if no def found initialize to 0
                if (decl.linkage === "external") {
                    this.externalVar(decl).addDeclaration(decl);
                } else {
                    // tentative definition with internal linkage
                    decl.definition = new CVarDefinition(decl.node, decl.name, decl.type, decl.storage, decl.linkage);

                    // don't emit now, will emit when linking if used
                    // this._emitVariables.push(decl.definition);
                }

            } else if (decl instanceof CVarDefinition) {
                if (decl.linkage === "external") {
                    this.externalVar(decl).setDefinition(decl, this);
                }
                // if (decl.storage === "static") this._emitVariables.push(decl);

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
        } else if ((node instanceof CFuncDefinition ? false : node.fnImport) !== (result.definition ? false : result.declarationArray[0].fnImport)) {
            throw new LinkingError("Tried to link mix of functions marked import", node.node, result.parseNode);
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

class Linkable<Decl extends CVarDeclaration | CFuncDeclaration, Def extends Decl["definition"]> {
    protected readonly declarations: Decl[] = [];
    protected _definition?: Def;
    protected _defLinker?: Linker;

    constructor(readonly id: string, readonly type: Decl["type"]) {

    }

    addDeclaration(d: Decl) {
        this.declarations.push(d);
        if (this._definition) d.definition = this._definition;
    }

    setDefinition(d: NonNullable<Def>, defLinker: Linker) {
        if (this._definition !== undefined) {
            throw new LinkingError("Already defined!", d.node, this.parseNode);
        }
        this._definition = d;
        this._defLinker = defLinker;

        this.declarations.forEach(x => {
            x.definition = d;
        });
    }

    get parseNode(): ParseNode {
        if (this._definition) return this._definition.node;
        if (this.declarations.length > 0) return this.declarations[0].node;
        throw new LinkingError("Linkable without parse node? This shouldn't happen!");
    }

    get definition(): Def | undefined {
        return this._definition;
    }

    get definitionLinker(): Linker {
        if (!this._defLinker) throw new Error("Definition not set");
        return this._defLinker;
    }

    get declarationArray(): ReadonlyArray<Decl> {
        return this.declarations;
    }
}

class ExternalFunction extends Linkable<CFuncDeclaration, CFuncDefinition | CFuncImport> {
    readonly externalType = "function";
}

class ExternalVariable extends Linkable<CVarDeclaration, CVarDefinition> {
    readonly externalType = "variable";
}

class LinkingError extends CError {
    name = "LinkingError";
}
