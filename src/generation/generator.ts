import {CFuncDefinition, CFuncDeclaration, CVariable} from "../tree/declarations";
import type {CExpression} from "../tree/expressions";
import type {Scope} from "../tree/scope";
import type {CStatement} from "../tree/statements";
import {ModuleBuilder, WFunctionBuilder, WFunction, Instructions, WImportedFunction} from "../wasm";
import {funcidx} from "../wasm/base_types";
import type {WExpression} from "../wasm/instructions";
import {expressionGeneration} from "./expressions";
import {statementGeneration} from "./statements";
import {storageSetupStaticVar} from "./storage";
import {realType, returnType} from "./type_conversion";

export class WGenerator {
    readonly module: ModuleBuilder;
    readonly functions = new Map<string, WFunction | WImportedFunction>();

    // current memory pointers
    nextStaticAddr = 32; // reserve first 32 bytes as 0

    constructor(readonly translationUnit: Scope) {
        this.module = new ModuleBuilder();

        for (const decl of translationUnit.declarations) {
            if (decl instanceof CFuncDefinition) this.function(decl);
            else if (decl instanceof CFuncDeclaration && decl.storage === "extern") this.externFunction(decl);
            else if (decl instanceof CFuncDeclaration) throw new Error("Undefined function " + decl.name);
            else if (decl instanceof CVariable) storageSetupStaticVar(this, decl);
            else throw new Error("Unexpected declaration");
        }

        this.module.setupMemory(Math.ceil(this.nextStaticAddr / 65536));
    }

    private function(func: CFuncDefinition) {
        const wasmFunc = this.module.function(
            func.type.parameterTypes.map(realType),
            returnType(func.type.returnType),
            b => this.functionBody(func, b),
            func.storage === undefined ? func.name : undefined);
        this.functions.set(func.name, wasmFunc);
    }

    private functionBody(s: CFuncDefinition, b: WFunctionBuilder): WExpression {
        const body = new WFnGenerator(this, b).statement(s.body);
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

    private externFunction(func: CFuncDeclaration) {
        const wasmFunc = this.module.importFunction(
            func.type.parameterTypes.map(realType),
            returnType(func.type.returnType),
            "extern",
            func.name);
        this.functions.set(func.name, wasmFunc);
    }

    functionIndex(fn: CFuncDeclaration | CFuncDefinition): {getIndex(): funcidx} {
        return {
            getIndex: () => {
                const wasmFunc = this.functions.get(fn.name);
                if (wasmFunc === undefined) throw new Error(`Function ${fn.name} not found`);
                return wasmFunc.getIndex();
            }
        };
    }
}

export class WFnGenerator {
    constructor(readonly gen: WGenerator, readonly builder: WFunctionBuilder) {
    }

    statement(s: CStatement): WExpression {
        return statementGeneration(this, s);
    }

    expression(e: CExpression, discardResult: boolean): WExpression {
        return expressionGeneration(this, e, discardResult);
    }
}
