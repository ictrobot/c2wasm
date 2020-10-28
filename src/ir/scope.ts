import type {ParseNode} from "../parsing/parsetree";
import {CVariable, CDeclaration, CFunction} from "./declarations";
import type {CCompound} from "./types";

export class Scope {
    private tags = new Map<string, CCompound>(); // names of structs, unions & enums
    private identifiers = new Map<string, CDeclaration>(); // names of variables and functions

    constructor(readonly node?: ParseNode, private parent?: Scope) {
    }

    private _getTag(tag: string): CCompound | undefined {
        return this.tags.get(tag) ?? this.parent?._getTag(tag);
    }

    lookupTag<T extends CCompound>(tag: string, wantedType?: {new(...args: any[]): T}): T {
        const result = this._getTag(tag);
        if (!result) {
            throw new Error("Failed to find `" + tag + "`");
        } else if (wantedType && wantedType.prototype !== Object.getPrototypeOf(result)) {
            throw new Error("`" + tag + "` was already declared as a different type!");
        }
        return result as T;
    }

    addTag(value: CCompound): void {
        if (!value.name) throw new Error("Cannot add nameless compound type to scope");
        if (this._getTag(value.name)) throw new Error("Compound type `" + value.name + "` is already defined!");
        this.tags.set(value.name, value);
    }

    private _getId(name: string): CDeclaration | undefined {
        return this.identifiers.get(name) ?? this.parent?._getId(name);
    }

    lookupIdentifier(name: string): CDeclaration {
        const result = this._getId(name);
        if (!result) {
            throw new Error("Failed to find `" + result + "`");
        }
        return result;
    }

    addIdentifier(value: CDeclaration): void {
        if (this._getId(value.name)) throw new Error("Identifier `" + value.name + "` is already defined!");
        this.identifiers.set(value.name, value);
    }
}
