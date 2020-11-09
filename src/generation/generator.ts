import {CFuncDefinition, CFuncDeclaration} from "../tree/declarations";
import type {CExpression} from "../tree/expressions";
import type {Scope} from "../tree/scope";
import type {CStatement} from "../tree/statements";
import {ModuleBuilder, WFunctionBuilder, WFunction} from "../wasm";
import {funcidx} from "../wasm/base_types";
import type {WExpression} from "../wasm/instructions";
import {expressionGeneration} from "./expressions";
import {statementGeneration} from "./statements";
import {getType} from "./type_conversion";

export class WGenerator {
    readonly module: ModuleBuilder;
    readonly functions = new Map<string, WFunction>();

    constructor(readonly translationUnit: Scope) {
        this.module = new ModuleBuilder();
        for (const decl of translationUnit.declarations) {
            if (decl instanceof CFuncDefinition) this.function(decl);
            else throw new Error("TODO");
        }
    }

    statement(s: CStatement, b: WFunctionBuilder): WExpression {
        return statementGeneration(this, s, b);
    }

    expression(e: CExpression, b: WFunctionBuilder): WExpression {
        return expressionGeneration(this, e, b);
    }

    private function(func: CFuncDefinition) {
        const wasmFunc = this.module.function(
            func.type.parameterTypes.map(getType),
            [getType(func.type.returnType)],
            b => this.statement(func.body, b),
            func.storage === undefined ? func.name : undefined);
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
