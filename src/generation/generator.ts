import type {Linker} from "../linker";
import {interproceduralOptimise} from "../optimisation/interprocedural";
import {getFlags} from "../optimisation/flags";
import {CFuncDefinition, CFuncDeclaration} from "../ir/declarations";
import type {CExpression} from "../ir/expressions";
import type {CStatement} from "../ir/statements";
import {CArithmetic, CFuncType, CPointer} from "../ir/types";
import {ModuleBuilder, WFunctionBuilder, WFunction, Instructions, WImportedFunction, ValueType, i32Type} from "../wasm";
import type {funcidx, tableidx, typeidx} from "../wasm/base_types";
import type {WLocal} from "../wasm/functions";
import type {WGlobal} from "../wasm/global";
import type {WInstruction} from "../wasm/instructions";
import {FunctionType} from "../wasm/wtypes";
import {expressionGeneration} from "./expressions";
import {GenError} from "./gen_error";
import {statementGeneration} from "./statements";
import {storageSetupStaticVar} from "./storage";
import {realType, returnType, largeReturn} from "./type_conversion";

export const SHADOW_STACK_SIZE = 2 ** 20;
export const FIRST_STATIC_ADDR = 32; // reserve first 32 bytes as 0

export class WGenerator {
    readonly module: ModuleBuilder;
    readonly functions = new Map<CFuncDefinition | CFuncDeclaration, WFunction | WImportedFunction>();

    // current memory pointers
    nextStaticAddr = FIRST_STATIC_ADDR;
    _shadowStackPtr?: WGlobal;

    constructor(linker: Linker) {
        this.module = new ModuleBuilder();

        const staticInitializers = [];
        for (const variable of linker.emitVariables) {
            const initializer = storageSetupStaticVar(this, variable);
            if (initializer) staticInitializers.push(initializer);
        }

        // add all functions
        for (const funcImport of linker.emitImports) this.importFunction(funcImport);
        for (const func of linker.emitExportedFunctions) this.function(func, func.name);
        for (const func of linker.emitFunctions) this.function(func);

        // define non-imported functions
        for (const [cfunc, wfunc] of this.functions.entries()) {
            if (cfunc instanceof CFuncDefinition && wfunc instanceof WFunction) {
                wfunc.define(b => this.functionBody(cfunc, b));
            }
        }

        for (const initializer of staticInitializers) initializer();

        interproceduralOptimise(this.module);

        this.module.emitCallback = () => {
            const staticSize = Math.ceil(this.nextStaticAddr / 1024) * 1024;
            if (this._shadowStackPtr) {
                const shadowStackStart = staticSize + 1024; // between 1024-2047 byte buffer
                this._shadowStackPtr.initialValue = BigInt(shadowStackStart);
                this.module.setupMemory(Math.ceil((shadowStackStart + SHADOW_STACK_SIZE) / 65536));
            } else if (this.isMemoryUsed()) {
                this.module.setupMemory(Math.ceil(staticSize / 65536));
            }
        };
    }

    get shadowStackPtr(): WGlobal {
        if (!this._shadowStackPtr) {
            this._shadowStackPtr = this.module.global(i32Type, true, 0n, "__sp");
        }
        return this._shadowStackPtr;
    }

    private isMemoryUsed(): boolean {
        if (this._shadowStackPtr || this.nextStaticAddr > FIRST_STATIC_ADDR) return true;

        for (const f of this.module.functions) {
            for (const instr of f.body.instructionsRecursive()) {
                if (instr.type === "structured") {
                    // structured instructions include the resources used by child instructions
                    // and can't directly read/write memory
                    continue;
                }
                if (instr.name === "call" || instr.name === "call_indirect") {
                    // call instructions include "memory" to ensure flow analysis is safe
                    continue;
                }
                if (instr.reads.includes("memory") || instr.writes.includes("memory")) {
                    return true;
                }
            }
        }
        return false;
    }

    private function(func: CFuncDefinition, name?: string) {
        if (largeReturn(func.type.returnType)) {
            // would be hard to correctly call, so don't export
            name = undefined;
        }
        if (name && !func.type.parameterTypes.every(t => t instanceof CArithmetic)) {
            // ensure ssp is included for argument passing when exported unless arguments are all numbers
            this.shadowStackPtr;
        }

        const wasmFunc = this.module.function(...WGenerator.funcType(func.type), undefined, name);
        wasmFunc.hints.inline = func.hints.inline;
        this.functions.set(func, wasmFunc);
    }

    private functionBody(s: CFuncDefinition, b: WFunctionBuilder): WInstruction[] {
        const fnGenerator = new WFnGenerator(this, b, s.name);
        const body = fnGenerator.statement(s.body);

        if (fnGenerator.shadowStackUsage > 0 && getFlags().generation_zero_shadow_stack) {
            // use memory.fill to ensure shadow stack space is 0 before fn runs
            // not technically needed as automatic variables do not have default initializers
            body.unshift(
                Instructions.global.get(this.shadowStackPtr),
                Instructions.i32.const(0),
                Instructions.i32.const(fnGenerator.shadowStackUsage),
                Instructions.memory.fill()
            );
        }
        return body;
    }

    private importFunction(func: CFuncDeclaration) {
        const wasmFunc = this.module.importFunction(
            func.type.parameterTypes.map(realType),
            returnType(func.type.returnType),
            "c2wasm",
            func.name);
        this.functions.set(func, wasmFunc);
    }

    functionIndex(fn: CFuncDeclaration | CFuncDefinition): {getIndex(): funcidx} {
        if (fn instanceof CFuncDeclaration && fn.definition !== undefined) fn = fn.definition.getFunction();

        return {
            getIndex: () => {
                const wasmFunc = this.functions.get(fn);
                if (wasmFunc === undefined) throw new GenError(`Function '${fn.name}' not emitted`, undefined, fn.node);
                return wasmFunc.getIndex();
            }
        };
    }

    private static funcType(fnType: CFuncType): FunctionType {
        const paramTypes = fnType.parameterTypes.map(realType);
        if (largeReturn(fnType.returnType)) {
            paramTypes.push(i32Type); // add additional argument for large return pointer
        }

        return [paramTypes, returnType(fnType.returnType)];
    }

    typeIndex(fnType: CFuncType): typeidx {
        return this.module._typeIndex(WGenerator.funcType(fnType));
    }

    indirectIndex(fn: CFuncDeclaration | CFuncDefinition): tableidx {
        if (fn instanceof CFuncDeclaration && fn.definition !== undefined) fn = fn.definition.getFunction();

        const wasmFunc = this.functions.get(fn);
        if (wasmFunc === undefined) throw new GenError(`Function '${fn.name}' not emitted`, undefined, fn.node);
        return wasmFunc.getTableIndex();
    }
}

export class WFnGenerator {
    shadowStackUsage: number = 0;

    constructor(readonly gen: WGenerator, readonly builder: WFunctionBuilder, readonly fnName: string) {
    }

    statement(s: CStatement): WInstruction[] {
        return statementGeneration(this, s);
    }

    expression(e: CExpression, discardResult: boolean): WInstruction[] {
        return expressionGeneration(this, e, discardResult);
    }

    withTemporaryLocal<T>(type: ValueType, expressionFn: (local: WLocal) => T): T {
        const local = this.builder.getTempLocal(type);
        const expression = expressionFn(local);
        this.builder.freeTempLocal(local);
        return expression;
    }
}
