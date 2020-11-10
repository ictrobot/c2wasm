import {CArgument, CVariable, CDeclaration} from "../tree/declarations";
import * as e from "../tree/expressions";
import {Scope} from "../tree/scope";
import {WFunctionBuilder, Instructions} from "../wasm";
import {localidx} from "../wasm/base_types";
import {WExpression} from "../wasm/instructions";
import {WGenerator} from "./generator";
import {realType} from "./type_conversion";

export type StorageLocation = {"type": "local", "index": {getIndex(d: number): localidx}};

export function storageSetupScope(m: WGenerator, s: Scope, b: WFunctionBuilder): void {
    for (const declaration of s.declarations) {
        if (declaration instanceof CArgument) {
            setStorageLocation(declaration, {
                type: "local",
                index: b.args[declaration.index]
            });
        }

        if (declaration instanceof CVariable) {
            setStorageLocation(declaration, {
                type: "local",
                index: b.addLocal(realType(declaration.type))
            });
        }
    }
}

export function storageLocationFromExpression(m: WGenerator, s: e.CExpression): [WExpression, StorageLocation] {
    if (!s.lvalue) throw new Error("Only lvalue expressions can have storage locations");

    if (s instanceof e.CIdentifier) {
        const location = getStorageLocation(s.value);
        if (location) return [[], location];
    } else if (s instanceof e.CMemberAccess) {
        // TODO
    } else if (s instanceof e.CDereference) {
        // TODO
    }
    throw new Error("TODO");
}

export function storageGet(m: WGenerator, location: StorageLocation): WExpression {
    return [Instructions.local.get(location.index)];
}

export function storageSet(m: WGenerator, location: StorageLocation, keepValue: boolean): WExpression {
    if (keepValue) {
        return [Instructions.local.tee(location.index)];
    } else {
        return [Instructions.local.set(location.index)];
    }
}


const locationSymbol = Symbol("storage location");
function setStorageLocation(s: CDeclaration, loc: StorageLocation) {
    (s as any as Record<typeof locationSymbol, StorageLocation>)[locationSymbol] = loc;
}

function getStorageLocation(s: CDeclaration): StorageLocation | undefined {
    return (s as any as Record<typeof locationSymbol, StorageLocation | undefined>)[locationSymbol];
}
