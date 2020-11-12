import {CArgument, CVariable, CDeclaration} from "../tree/declarations";
import {CExpression} from "../tree/expressions";
import * as e from "../tree/expressions";
import {Scope} from "../tree/scope";
import {CType, CArithmetic} from "../tree/types";
import {Instructions} from "../wasm";
import {localidx} from "../wasm/base_types";
import {WExpression, WInstruction} from "../wasm/instructions";
import {WFnGenerator, WGenerator} from "./generator";
import {staticInitializer} from "./static_initializer";
import {realType} from "./type_conversion";

export type StorageLocation =
    {type: "local", "index": {getIndex(d: number): localidx}} |
    {type: "static", "address": number};

export function storageSetupStaticVar(ctx: WGenerator, d: CVariable): void {
    const addr = ctx.nextStaticAddr;
    setStorageLocation(d, {
        type: "static",
        address: addr
    });
    if (d.staticValue) {
        if (d.staticValue.type !== d.type) throw new Error("TODO: static constants with different type from variable");
        ctx.module.dataSegment(addr, staticInitializer(d.staticValue));
    }

    ctx.nextStaticAddr += Math.ceil(d.type.bytes / 4) * 4; // 4 byte align
}

export function storageSetupScope(ctx: WFnGenerator, s: Scope): void {
    for (const declaration of s.declarations) {
        if (declaration instanceof CArgument) {
            setStorageLocation(declaration, {
                type: "local",
                index: ctx.builder.args[declaration.index]
            });
        }

        if (declaration instanceof CVariable) {
            if (declaration.storage === undefined) {
                setStorageLocation(declaration, {
                    type: "local",
                    index: ctx.builder.addLocal(realType(declaration.type))
                });
            } else if (declaration.storage === "static") {
                storageSetupStaticVar(ctx.gen, declaration);
            }
        }
    }
}

// the storage operations

/** Pushes the stored value from location 'e' onto the stack  */
export function storageGet(ctx: WFnGenerator, ctype: CType, locationExpr: CExpression): WExpression {
    const [instr, location] = fromExpression(ctx, locationExpr);

    if (location.type === "local") {
        instr.push(Instructions.local.get(location.index));
    } else {
        instr.push(...load(ctype, location.address));
    }
    return instr;
}

/** Stores the value on the top of the stack when 'valueExpr' is run into location 'locationExpr'.
 * If keepValue is true then the stored value is kept on the top of the stack after being stored */
export function storageSet(ctx: WFnGenerator, ctype: CType, locationExpr: CExpression, valueExpr: CExpression, keepValue: boolean): WExpression {
    const [instr, location] = fromExpression(ctx, locationExpr);
    const valueInstr = ctx.expression(valueExpr, false);

    if (location.type === "local") {
        instr.push(...valueInstr, keepValue ? Instructions.local.tee(location.index) : Instructions.local.set(location.index));
    } else {
        // store instructions expect value on top of stack and then the address to be added to the offset under
        instr.push(Instructions.i32.const(0), ...valueInstr, store(ctype, location.address));
        if (keepValue) instr.push(...load(ctype, location.address));
    }
    return instr;
}

/** Updates the location 'locationExpr' by running 'instr' which should transform its value on the stack.
 * If keepValue is true then the stored value is kept on the top of the stack after being stored */
export function storageUpdate(ctx: WFnGenerator, ctype: CType, locationExpr: CExpression, transform: WExpression, keepValue: boolean): WExpression {
    const [instr, location] = fromExpression(ctx, locationExpr, 2);

    if (location.type === "local") {
        instr.push(Instructions.local.get(location.index), ...transform);
        if (keepValue) instr.push(Instructions.local.tee(location.index));
        else instr.push(Instructions.local.set(location.index));
    } else {
        // store instructions expect value on top of stack and then the address to be added to the offset under
        instr.push(Instructions.i32.const(0), ...load(ctype, location.address), ...transform, store(ctype, location.address));
        if (keepValue) instr.push(...load(ctype, location.address));
    }
    return instr;
}

// helper to get the storage location from an expression

/**
 * Helper function which finds the storage location from a CExpression.
 *
 * The first return value are instructions to be executed before accessing the storage and
 * the second return value is the storage location itself.
 */
function fromExpression(ctx: WFnGenerator, s: e.CExpression, accessTimes: 1 | 2 = 1): [WExpression, StorageLocation] {
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

// helpers for storing storage location on variables using a Symbol

const locationSymbol = Symbol("storage location");
function setStorageLocation(s: CDeclaration, loc: StorageLocation) {
    (s as any as Record<typeof locationSymbol, StorageLocation>)[locationSymbol] = loc;
}

function getStorageLocation(s: CDeclaration): StorageLocation | undefined {
    return (s as any as Record<typeof locationSymbol, StorageLocation | undefined>)[locationSymbol];
}

// helpers returning the instructions to read/write a type from memory

function load(type: CType, address: number): WExpression {
    if (!(type instanceof CArithmetic)) throw new Error("TODO");

    const c0 = Instructions.i32.const(0);
    if (type.type === "float") {
        if (type.bytes === 8) {
            return [c0, Instructions.f64.load(2, address)];
        } else {
            return [c0, Instructions.f32.load(2, address)];
        }

    } else if (type.bytes === 8) {
        return [c0, Instructions.i64.load(2, address)];

    } else if (type.bytes === 4) {
        return [c0, Instructions.i32.load(2, address)];

    } else if (type.type === "signed") {
        if (type.bytes === 2) {
            return [c0, Instructions.i32.load16_s(1, address)];
        } else {
            return [c0, Instructions.i32.load8_s(0, address)];
        }

    } else {
        if (type.bytes === 2) {
            return [c0, Instructions.i32.load16_u(1, address)];
        } else {
            return [c0, Instructions.i32.load8_u(0, address)];
        }
    }
}

function store(type: CType, address: number): WInstruction {
    if (!(type instanceof CArithmetic)) throw new Error("TODO");

    if (type.type === "float") {
        if (type.bytes === 8) {
            return Instructions.f64.store(2, address);
        } else {
            return Instructions.f32.store(2, address);
        }

    } else if (type.bytes === 8) {
        return Instructions.i64.store(2, address);
    } else if (type.bytes === 4) {
        return Instructions.i32.store(2, address);
    } else if (type.bytes === 2) {
        return Instructions.i32.store16(1, address);
    } else {
        return Instructions.i32.store8(0, address);
    }
}
