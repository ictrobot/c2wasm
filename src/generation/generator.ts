import type {Linker} from "../linker";
import {interproceduralOptimize} from "../optimization/interprocedural";
import {getFlags} from "../optimization/flags";
import {CFuncDefinition, CFuncDeclaration} from "../ir/declarations";
import type {CExpression} from "../ir/expressions";
import type {CStatement} from "../ir/statements";
import type {CFuncType} from "../ir/types";
import {ModuleBuilder, WFunctionBuilder, WFunction, Instructions, WImportedFunction, ValueType, i32Type} from "../wasm";
import type {funcidx, tableidx, typeidx} from "../wasm/base_types";
import type {WLocal} from "../wasm/functions";
import type {WGlobal} from "../wasm/global";
import type {WInstruction} from "../wasm/instructions";
import {expressionGeneration} from "./expressions";
import {GenError} from "./gen_error";
import {statementGeneration} from "./statements";
import {storageSetupStaticVar} from "./storage";
import {realType, returnType} from "./type_conversion";

export const SHADOW_STACK_SIZE = 2 ** 20;

export class WGenerator {
    readonly module: ModuleBuilder;
    readonly functions = new Map<CFuncDefinition | CFuncDeclaration, WFunction | WImportedFunction>();

    // current memory pointers
    nextStaticAddr = 32; // reserve first 32 bytes as 0
    readonly shadowStackPtr: WGlobal;

    constructor(linker: Linker) {
        this.module = new ModuleBuilder();
        this.shadowStackPtr = this.module.global(i32Type, true, 0n, "__sp");

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

        interproceduralOptimize(this.module);

        this.module.emitCallback = () => {
            const shadowStackStart = Math.ceil(this.nextStaticAddr / 1024) * 1024;
            this.shadowStackPtr.initialValue = BigInt(shadowStackStart);
            this.module.setupMemory(Math.ceil((shadowStackStart + SHADOW_STACK_SIZE) / 65536));
        };
    }

    private function(func: CFuncDefinition, name?: string) {
        const wasmFunc = this.module.function(
            func.type.parameterTypes.map(realType),
            returnType(func.type.returnType),
            undefined,
            name);
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

    typeIndex(fnType: CFuncType): typeidx {
        return this.module._typeIndex([fnType.parameterTypes.map(realType), returnType(fnType.returnType)]);
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
