import {CError} from "../c_error";
import type {ParseNode} from "../parsing";
import type {CDeclaration} from "./declarations";
import {CFuncDeclaration, CFuncDefinition} from "./declarations";
import type {CCompound} from "./types";

/**
 * Represents a scope storing identifiers (variables & functions) and tags (struct, union & enum names) in the IR.
 * Each one has a parent scope excluding the base scope for the translation unit.
 *
 * e.g. base scope (function declarations) <- function scope (contains parameters) <- compound statement scope (fn locals).
 *
 * If a tag or identifier isn't found in the current scope, parents are checked.
 */
export class Scope {
    private tags = new Map<string, CCompound>(); // names of structs, unions & enums
    private identifiers = new Map<string, CDeclaration>(); // names of variables and functions

    constructor(readonly node?: ParseNode, readonly parent?: Scope) {
    }

    private _getTag(tag: string): CCompound | undefined {
        // perform recursive lookup in parents if not found
        return this.tags.get(tag) ?? this.parent?._getTag(tag);
    }

    lookupTag<T extends CCompound>(tag: string, wantedType?: {new(...args: any[]): T}, node?: ParseNode): T | undefined {
        const result = this._getTag(tag);
        if (wantedType && result && wantedType.prototype !== Object.getPrototypeOf(result)) {
            throw new ScopeError("`" + tag + "` was already declared as a " + result.typeName, result.node, node);
        }
        return result as T | undefined;
    }

    addTag(value: CCompound): void {
        if (!value.name) throw new Error("Cannot add nameless compound type to scope"); // shouldn't happen
        if (this._getTag(value.name)) throw new ScopeError("Compound type `" + value.name + "` is already defined!", value.node);
        this.tags.set(value.name, value);
    }

    private _getId(name: string): CDeclaration | undefined {
        return this.identifiers.get(name) ?? this.parent?._getId(name);
    }

    lookupIdentifier(name: string, node?: ParseNode): CDeclaration {
        const result = this._getId(name);
        if (!result) {
            throw new ScopeError("Failed to find `" + name + "`", node);
        }
        return result;
    }

    addIdentifier(value: CDeclaration): void {
        const existing = this.identifiers.get(value.name); // allowing redefining identifiers defined in parent scopes
        if (existing) {
            if (existing.type.equals(value.type) && existing instanceof CFuncDeclaration && value instanceof CFuncDefinition) {
                // allow replacement of function declaration with definition
                existing.definition = value;
            } else if (existing.type.equals(value.type) && (existing instanceof CFuncDeclaration || value instanceof CFuncDeclaration)) {
                // allow function declarations to be redeclared (but don't override instance in scope)
                return;
            } else {
                throw new ScopeError("Identifier `" + value.name + "` is already defined in this scope!", existing.node, value.node);
            }
        }
        this.identifiers.set(value.name, value);
    }

    get declarations(): ReadonlyArray<CDeclaration> {
        return [...this.identifiers.values()];
    }
}

class ScopeError extends CError {
    name = "ScopeError";
}
