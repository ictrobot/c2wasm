import test, {ExecutionContext} from "ava";
import {compileSnippet} from "../../src/compile";
import {OptimizationFlags, setFlags} from "../../src/optimization/flags";
import {ModuleBuilder, WExpression} from "../../src/wasm";

export function optimizationTest(title: string,
                                 flags: Partial<OptimizationFlags>,
                                 fn: (t: ExecutionContext, defaultModule: ModuleBuilder, flagsModule: ModuleBuilder) => void,
                                 src: string): void {
    test(title, t => {
        setFlags("none");
        const originalModule = compileSnippet(src);
        setFlags(flags);
        const flagsModule = compileSnippet(src);
        setFlags("default"); // restore flags

        fn(t, originalModule, flagsModule);
    });
}

export function countInstructions(instrName: string, expr: WExpression, recursive: boolean): number {
    let num = 0;
    for (const instr of expr.instructions) {
        if (instr.name === instrName) num++;
        if (recursive && instr.type === "structured") {
            num += countInstructions(instrName, instr.immediate.expression, recursive);
            if (instr.immediate.expression2) num += countInstructions(instrName, instr.immediate.expression2, recursive);
        }
    }
    return num;
}
