import type {Linker} from "../linker";
import {CFuncDefinition, CFuncDeclaration} from "../tree/declarations";
import type {CExpression} from "../tree/expressions";
import type {CStatement} from "../tree/statements";
import type {CFuncType} from "../tree/types";
import {ModuleBuilder, WFunctionBuilder, WFunction, Instructions, WImportedFunction, ValueType, i32Type} from "../wasm";
import type {funcidx, tableidx, typeidx} from "../wasm/base_types";
import type {WLocal} from "../wasm/functions";
import type {WGlobal} from "../wasm/global";
import type {WExpression} from "../wasm/instructions";
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
        this.shadowStackPtr = this.module.global(i32Type, true, 0n);

        const staticInitializers = [];
        for (const variable of linker.emitVariables) {
            const initializer = storageSetupStaticVar(this, variable);
            if (initializer) staticInitializers.push(initializer);
        }

        for (const func of linker.emitImports) {
            this.importFunction(func);
        }
        for (const funcImport of linker.emitNamedFunctions) {
            this.function(funcImport, funcImport.name);
        }
        for (const funcImport of linker.emitFunctions) {
            this.function(funcImport);
        }

        for (const initializer of staticInitializers) initializer();

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
            b => this.functionBody(func, b),
            name);
        this.functions.set(func, wasmFunc);
    }

    private functionBody(s: CFuncDefinition, b: WFunctionBuilder): WExpression {
        const fnGenerator = new WFnGenerator(this, b, s.name);
        const body = fnGenerator.statement(s.body);

        if (fnGenerator.shadowStackUsage > 0) {
            // use memory.fill to ensure shadow stack space is 0 before fn runs
            body.unshift(
                Instructions.global.get(this.shadowStackPtr),
                Instructions.i32.const(0),
                Instructions.i32.const(fnGenerator.shadowStackUsage),
                Instructions.memory.fill()
            );
        }

        if (s.type.returnType.bytes > 0) {
            if (body[body.length - 1] === Instructions.return()) {
                // Final return can be implicit
                body.pop();
            } else {
                // No return generated at the end of the function, however this fn must have passed c-tree
                // always returns validation. Therefore add a trapping unreachable instruction to end of function body
                // to pass wasm validation.
                body.push(Instructions.unreachable());
            }
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
    private temporaries: WLocal[] = [];
    shadowStackUsage: number = 0;

    constructor(readonly gen: WGenerator, readonly builder: WFunctionBuilder, readonly fnName: string) {
    }

    statement(s: CStatement): WExpression {
        return statementGeneration(this, s);
    }

    expression(e: CExpression, discardResult: boolean): WExpression {
        return expressionGeneration(this, e, discardResult);
    }

    withTemporaryLocal(type: ValueType, expressionFn: (local: WLocal) => WExpression): WExpression {
        const localIdx = this.temporaries.findIndex(x => x.type === type);
        let local: WLocal;
        if (localIdx < 0) {
            // no previous temporary local can be used, allocate a new one
            local = this.builder.addLocal(type);
        } else {
            local = this.temporaries.splice(localIdx, 1)[0];
        }

        const expression = expressionFn(local);
        this.temporaries.push(local);
        return expression;
    }
}
