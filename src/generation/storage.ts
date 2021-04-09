import {CArgument, CDeclaration, CVarDefinition, CVarDeclaration} from "../ir/declarations";
import {CExpression} from "../ir/expressions";
import * as e from "../ir/expressions";
import {Scope} from "../ir/scope";
import {CType, CArithmetic, CPointer, CStruct, CUnion, CArray, CVoid, CFuncType} from "../ir/types";
import {Instructions, i32Type} from "../wasm";
import {localidx} from "../wasm/base_types";
import {WLocal} from "../wasm/functions";
import {WInstruction} from "../wasm/instructions";
import {GenError} from "./gen_error";
import {WFnGenerator, WGenerator} from "./generator";
import {staticInitializer} from "./static_initializer";
import {realType, conversion} from "./type_conversion";

export type StorageLocation =
    {type: "local", "index": {getIndex(d: number): localidx}} |
    {type: "static", "address": number} |
    {type: "shadow", "shadowOffset": number} | // offset from shadow pointer
    {type: "pointer"}; // address on stack

/** Setup the static storage location for a variable and if it has a static initializer return a function to set the
 * value AFTER all the functions have been created. This allows static initializer values to refer to each other
 * and to functions. Whilst creating functions only the location of the static variable is needed, not it's value. */
export function storageSetupStaticVar(ctx: WGenerator, d: CVarDefinition): (() => void) | undefined {
    const addr = Math.ceil(ctx.nextStaticAddr / d.type.alignment) * d.type.alignment;
    ctx.nextStaticAddr = addr + d.type.bytes;

    setStorageLocation(d, {
        type: "static",
        address: addr
    });

    if (d.staticValue) {
        const value = d.staticValue;
        return () => ctx.module.dataSegment(addr, staticInitializer(ctx, value, d.type));
    }
}

export function storageSetupScope(ctx: WFnGenerator, s: Scope): [setup: WInstruction[], finishedCallback: () => void] {
    const instr: WInstruction[] = [];
    const temporaries: WLocal[] = [];

    for (const declaration of s.declarations) {
        if (declaration instanceof CArgument) {
            if (declaration.type instanceof CStruct || declaration.type instanceof CUnion) {
                // argument is effectively a pointer to a struct/union to copy

                // align
                ctx.shadowStackUsage = Math.ceil(ctx.shadowStackUsage / declaration.type.alignment) * declaration.type.alignment;

                setStorageLocation(declaration, {
                    type: "shadow",
                    shadowOffset: ctx.shadowStackUsage
                });
                // copy from given pointer
                instr.push(...memcpy(
                    [Instructions.local.get(ctx.builder.args[declaration.index])],
                    [Instructions.global.get(ctx.gen.shadowStackPtr), Instructions.i32.const(ctx.shadowStackUsage), Instructions.i32.add()],
                    declaration.type.bytes
                ));
                ctx.shadowStackUsage += declaration.type.bytes;

            } else if (declaration.addressUsed) {
                ctx.shadowStackUsage = Math.ceil(ctx.shadowStackUsage / declaration.type.alignment) * declaration.type.alignment;
                setStorageLocation(declaration, {
                    type: "shadow",
                    shadowOffset: ctx.shadowStackUsage
                });
                // copy value onto shadow stack
                instr.push(Instructions.global.get(ctx.gen.shadowStackPtr));
                instr.push(Instructions.local.get(ctx.builder.args[declaration.index]));
                instr.push(store(declaration.type, ctx.shadowStackUsage));

                ctx.shadowStackUsage += declaration.type.bytes; // 4 byte align
            } else {
                setStorageLocation(declaration, {
                    type: "local",
                    index: ctx.builder.args[declaration.index]
                });
            }
        }

        if (declaration instanceof CVarDefinition) {
            if (declaration.storage === "local") {
                if (declaration.addressUsed || !(declaration.type instanceof CArithmetic || declaration.type instanceof CPointer)) {
                    // have to place on shadow stack
                    ctx.shadowStackUsage = Math.ceil(ctx.shadowStackUsage / declaration.type.alignment) * declaration.type.alignment;
                    setStorageLocation(declaration, {
                        type: "shadow",
                        shadowOffset: ctx.shadowStackUsage
                    });
                    ctx.shadowStackUsage += declaration.type.bytes;
                } else {
                    const local = ctx.builder.getTempLocal(realType(declaration.type));
                    temporaries.push(local);
                    setStorageLocation(declaration, {
                        type: "local",
                        index: local
                    });
                }
            } else if (declaration.storage === "static" && getStorageLocation(declaration) === undefined) { // storage should have already been setup
                throw new GenError("In function static variable is not setup");
            }
        }
    }

    return [instr, () => temporaries.forEach(x => ctx.builder.freeTempLocal(x))];
}

// the storage operations

/** Pushes the stored value from location 'e' onto the stack  */
export function storageGet(ctx: WFnGenerator, ctype: CType, locationExpr: CExpression): WInstruction[] {
    const [instr, location] = fromExpression(ctx, locationExpr);

    if (ctype instanceof CStruct || ctype instanceof CUnion || (ctype instanceof CPointer && ctype.original instanceof CArray)) {
        // loading a structure just returns a pointer
        return getAddress(ctx, locationExpr);
    }

    if (location.type === "local") {
        instr.push(Instructions.local.get(location.index));
    } else if (location.type === "static") {
        instr.push(Instructions.i32.const(0), load(ctype, location.address));
    } else if (location.type === "shadow") {
        instr.push(Instructions.global.get(ctx.gen.shadowStackPtr), load(ctype, location.shadowOffset));
    } else if (location.type === "pointer") {
        instr.push(load(ctype, 0));
    }
    return instr;
}

/** Stores the value on the top of the stack when 'valueExpr' is run into location 'locationExpr'.
 * If keepValue is true then the stored value is kept on the top of the stack after being stored */
export function storageSet(ctx: WFnGenerator, ctype: CType, locationExpr: CExpression, valueExpr: CExpression, keepValue: boolean): WInstruction[] {
    const [instr, location] = fromExpression(ctx, locationExpr);
    const valueInstr = ctx.expression(valueExpr, false);
    valueInstr.push(...conversion(valueExpr.type, locationExpr.type));

    if (ctype instanceof CStruct || ctype instanceof CUnion || ctype instanceof CArray) {
        // storing a structure copies memory, presumes pointer to the same type is on top of stack
        return memcpy(valueInstr, getAddress(ctx, locationExpr), ctype.bytes);
    }

    if (location.type === "local") {
        instr.push(...valueInstr, keepValue ? Instructions.local.tee(location.index) : Instructions.local.set(location.index));
    } else if (location.type === "static") {
        instr.push(Instructions.i32.const(0), ...valueInstr);
        if (keepValue) {
            instr.push(...ctx.withTemporaryLocal(realType(ctype), (tmp) => [
                Instructions.local.tee(tmp), // store copy of value
                store(ctype, location.address),
                Instructions.local.get(tmp)
            ]));
        } else {
            instr.push(store(ctype, location.address));
        }
    } else if (location.type === "shadow") {
        instr.push(Instructions.global.get(ctx.gen.shadowStackPtr), ...valueInstr);
        if (keepValue) {
            instr.push(...ctx.withTemporaryLocal(realType(ctype), (tmp) => [
                Instructions.local.tee(tmp), // store copy of value
                store(ctype, location.shadowOffset),
                Instructions.local.get(tmp)
            ]));
        } else {
            instr.push(store(ctype, location.shadowOffset));
        }
    } else if (location.type === "pointer") {
        // address should already be on top of the stack
        instr.push(...valueInstr);
        if (keepValue) {
            instr.push(...ctx.withTemporaryLocal(realType(ctype), (tmp) => [
                Instructions.local.tee(tmp), // store copy of value
                store(ctype, 0),
                Instructions.local.get(tmp)
            ]));
        } else {
            instr.push(store(ctype, 0));
        }
    }
    return instr;
}

/** Updates the location 'locationExpr' by running 'instr' which should transform its value on the stack.
 * If keepValue is true then the stored value is kept on the top of the stack after being stored */
export function storageUpdate(ctx: WFnGenerator, ctype: CType, locationExpr: CExpression, transform: WInstruction[], keepValue: boolean): WInstruction[] {
    if (ctype instanceof CArray || ctype instanceof CStruct || ctype instanceof CUnion) {
        throw new GenError("Cannot storageUpdate " + ctype.typeName, ctx, locationExpr.node);
    }
    const [instr, location] = fromExpression(ctx, locationExpr);

    if (location.type === "local") {
        instr.push(Instructions.local.get(location.index), ...transform);
        if (keepValue) instr.push(Instructions.local.tee(location.index));
        else instr.push(Instructions.local.set(location.index));

        return instr;
    } else if (location.type === "static") {
        instr.push(Instructions.i32.const(0), Instructions.i32.const(0), load(ctype, location.address), ...transform);

        if (keepValue) {
            instr.push(...ctx.withTemporaryLocal(realType(ctype), (tmp) => [
                Instructions.local.tee(tmp), // store copy of value
                store(ctype, location.address),
                Instructions.local.get(tmp)
            ]));
        } else {
            instr.push(store(ctype, location.address));
        }
    } else if (location.type === "shadow") {
        instr.push(Instructions.global.get(ctx.gen.shadowStackPtr), Instructions.global.get(ctx.gen.shadowStackPtr));
        instr.push(load(ctype, location.shadowOffset), ...transform);

        if (keepValue) {
            instr.push(...ctx.withTemporaryLocal(realType(ctype), (tmp) => [
                Instructions.local.tee(tmp), // store copy of value
                store(ctype, location.shadowOffset),
                Instructions.local.get(tmp)
            ]));
        } else {
            instr.push(store(ctype, location.shadowOffset));
        }
    } else if (location.type === "pointer") {
        instr.push(...ctx.withTemporaryLocal(i32Type, (addrTmp) => [
            Instructions.local.tee(addrTmp), // duplicate pointer on top of stack
            Instructions.local.get(addrTmp)
        ]));
        instr.push(load(ctype, 0), ...transform);

        if (keepValue) {
            instr.push(...ctx.withTemporaryLocal(realType(ctype), (tmp) => [
                Instructions.local.tee(tmp), // store copy of value
                store(ctype, 0),
                Instructions.local.get(tmp)
            ]));
        } else {
            instr.push(store(ctype, 0));
        }
    }
    return instr;
}

/** Updates the location 'locationExpr' by running 'instr' which should transform its value on the stack.
 * Value before transform is left on the stack */
export function storageGetThenUpdate(ctx: WFnGenerator, ctype: CType, locationExpr: CExpression, transform: WInstruction[]): WInstruction[] {
    if (ctype instanceof CArray || ctype instanceof CStruct || ctype instanceof CUnion) {
        throw new GenError("Cannot storageGetThenUpdate " + ctype.typeName, ctx, locationExpr.node);
    }
    const [instr, location] = fromExpression(ctx, locationExpr);

    if (location.type === "local") {
        instr.push(Instructions.local.get(location.index));
        instr.push(Instructions.local.get(location.index), ...transform, Instructions.local.set(location.index));
    } else if (location.type === "static") {
        instr.push(Instructions.i32.const(0), Instructions.i32.const(0), load(ctype, location.address));
        instr.push(...ctx.withTemporaryLocal(realType(ctype), (tmp) => [
            Instructions.local.tee(tmp), // store copy of old value
            ...transform,
            store(ctype, location.address),
            Instructions.local.get(tmp)
        ]));
    } else if (location.type === "shadow") {
        instr.push(Instructions.global.get(ctx.gen.shadowStackPtr), Instructions.global.get(ctx.gen.shadowStackPtr));
        instr.push(load(ctype, location.shadowOffset));

        instr.push(...ctx.withTemporaryLocal(realType(ctype), (tmp) => [
            Instructions.local.tee(tmp), // store copy of old value
            ...transform,
            store(ctype, location.shadowOffset),
            Instructions.local.get(tmp)
        ]));
    } else if (location.type === "pointer") {
        instr.push(...ctx.withTemporaryLocal(i32Type, (addrTmp) => [
            Instructions.local.tee(addrTmp), // duplicate pointer on top of stack
            Instructions.local.get(addrTmp)
        ]));
        instr.push(load(ctype, 0));
        instr.push(...ctx.withTemporaryLocal(realType(ctype), (tmp) => [
            Instructions.local.tee(tmp), // store copy of old value
            ...transform,
            store(ctype, 0),
            Instructions.local.get(tmp)
        ]));
    }
    return instr;
}

// helper to get address of a storage location
export function getAddress(ctx: WFnGenerator, s: e.CExpression): WInstruction[] {
    const [instr, loc] = fromExpression(ctx, s);
    if (loc.type === "local") {
        throw new GenError("Local with addressed access stored in local. This shouldn't happen!", ctx, s.node);
    } else if (loc.type === "static") {
        instr.push(Instructions.i32.const(loc.address));
    } else if (loc.type === "shadow") {
        instr.push(Instructions.global.get(ctx.gen.shadowStackPtr),
            Instructions.i32.const(loc.shadowOffset),
            Instructions.i32.add());
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
function fromExpression(ctx: WFnGenerator, s: e.CExpression): [WInstruction[], StorageLocation] {
    if (!s.lvalue) throw new GenError("Only lvalue expressions can have storage locations", ctx, s.node);

    if (s instanceof e.CIdentifier) {
        let location = getStorageLocation(s.value);
        if (location) return [[], location];

        if (s.value instanceof CVarDeclaration) {
            if (s.value.definition === undefined) throw new GenError("No variable definition found", ctx, s.node);
            location = getStorageLocation(s.value.definition);
            if (location) return [[], location];
        }

    } else if (s instanceof e.CMemberAccess) {
        const address = ctx.expression(s.body, false);
        if (s.structUnion instanceof CStruct) {
            let offset = 0;
            for (const member of s.structUnion.members) {
                offset = Math.ceil(offset / member.type.alignment) * member.type.alignment;
                if (member.name === s.member) break;
                offset += member.type.bytes;
            }
            return [[...address, Instructions.i32.const(offset), Instructions.i32.add()], {type: "pointer"}];
        }
        return [address, {type: "pointer"}]; // for unions
    } else if (s instanceof e.CDereference) {
        return [ctx.expression(s.body, false), {type: "pointer"}];
    }

    throw new GenError("Invalid location expression", ctx, s.node);
}

export function getStaticAddress(s: CDeclaration): number | undefined {
    if (s instanceof CVarDeclaration && s.definition) s = s.definition;
    const loc = getStorageLocation(s);
    return loc?.type === "static" ? loc.address : undefined;
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

function load(type: CType, offset: number): WInstruction {
    if (type instanceof CPointer) {
        return Instructions.i32.load(2, offset);
    }
    if (type instanceof CStruct || type instanceof CUnion || type instanceof CArray) {
        throw new Error("Invalid " + type.typeName + " load");
    }
    if (type instanceof CVoid || type instanceof CFuncType) {
        throw new Error("Cannot load " + type.typeName);
    }

    // must be arithmetic
    if (type.type === "float") {
        if (type.bytes === 8) {
            return Instructions.f64.load(3, offset);
        } else {
            return Instructions.f32.load(2, offset);
        }

    } else if (type.bytes === 8) {
        return Instructions.i64.load(3, offset);

    } else if (type.bytes === 4) {
        return Instructions.i32.load(2, offset);

    } else if (type.type === "signed") {
        if (type.bytes === 2) {
            return Instructions.i32.load16_s(1, offset);
        } else {
            return Instructions.i32.load8_s(0, offset);
        }

    } else {
        if (type.bytes === 2) {
            return Instructions.i32.load16_u(1, offset);
        } else {
            return Instructions.i32.load8_u(0, offset);
        }
    }
}

function store(type: CType, offset: number): WInstruction {
    if (type instanceof CPointer) {
        return Instructions.i32.store(2, offset);
    }
    if (type instanceof CStruct || type instanceof CUnion || type instanceof CArray) {
        throw new Error("Invalid " + type.typeName + " store");
    }
    if (type instanceof CVoid || type instanceof CFuncType) {
        throw new Error("Cannot store " + type.typeName);
    }

    if (type.type === "float") {
        if (type.bytes === 8) {
            return Instructions.f64.store(3, offset);
        } else {
            return Instructions.f32.store(2, offset);
        }

    } else if (type.bytes === 8) {
        return Instructions.i64.store(3, offset);
    } else if (type.bytes === 4) {
        return Instructions.i32.store(2, offset);
    } else if (type.bytes === 2) {
        return Instructions.i32.store16(1, offset);
    } else {
        return Instructions.i32.store8(0, offset);
    }
}

export function memcpy(sourceAddr: WInstruction[], destAddr: WInstruction[], bytes: number): WInstruction[] {
    return [
        ...destAddr,
        ...sourceAddr,
        Instructions.i32.const(bytes),
        Instructions.memory.copy()
    ];
}
