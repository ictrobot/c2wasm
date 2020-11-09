import {CFuncDefinition} from "../tree/declarations";
import type {CExpression} from "../tree/expressions";
import type {Scope} from "../tree/scope";
import type {CStatement} from "../tree/statements";
import {ModuleBuilder, WFunctionBuilder} from "../wasm";
import type {WExpression} from "../wasm/instructions";
import {expressionGeneration} from "./expressions";
import {statementGeneration} from "./statements";
import {getType} from "./type_conversion";

export class WGenerator {
    readonly module: ModuleBuilder;

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
        const returnType = getType(func.type.returnType);
        const parameterTypes = func.type.parameterTypes.map(getType);
        const exportName = func.storage === undefined ? func.name : undefined;
        this.module.function(parameterTypes, [returnType], b => this.statement(func.body, b), exportName);
    }
}
