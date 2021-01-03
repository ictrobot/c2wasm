import test, {ExecutionContext} from "ava";
import {compileSnippet} from "../../src/compile";
import {setFlags, OptimizationFlags} from "../../src/optimization/flags";
import {ModuleBuilder} from "../../src/wasm";

function optimizationTest(title: string,
                          flags: Partial<OptimizationFlags>,
                          fn: (t: ExecutionContext, defaultModule: ModuleBuilder, flagsModule: ModuleBuilder) => void,
                          src: string) {
    test(title, t => {
        setFlags(null);
        const defaultModule = compileSnippet(src);
        setFlags(flags);
        const flagsModule = compileSnippet(src);
        setFlags(null); // restore flags

        fn(t, defaultModule, flagsModule);
    });
}

optimizationTest("peephole_local_tee", {peephole_local_tee: false}, (t, withOptimization, without) => {
    const withoutInstrNames = without.functions[0].body.instructions.map(x => x.name);
    const withInstrNames = withOptimization.functions[0].body.instructions.map(x => x.name);

    t.deepEqual(withoutInstrNames, ["i32.const", "local.set", "local.get"]);
    t.deepEqual(withInstrNames, ["i32.const", "local.tee"]);
}, `
int test() {
    int a = 3;
    return a;
}
`);
