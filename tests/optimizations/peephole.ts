import test, {ExecutionContext} from "ava";
import {compileSnippet} from "../../src/compile";
import {setFlags, OptimizationFlags} from "../../src/optimization/flags";
import {ModuleBuilder} from "../../src/wasm";

function optimizationTest(title: string,
                          flags: Partial<OptimizationFlags>,
                          fn: (t: ExecutionContext, defaultModule: ModuleBuilder, flagsModule: ModuleBuilder) => void,
                          src: string) {
    test(title, t => {
        setFlags("none");
        const originalModule = compileSnippet(src);
        setFlags(flags);
        const flagsModule = compileSnippet(src);
        setFlags("default"); // restore flags

        fn(t, originalModule, flagsModule);
    });
}

optimizationTest("peephole_local_tee", {peephole_local_tee: true}, (t, withoutOpt, withOpt) => {
    const withoutInstrNames = withoutOpt.functions[0].body.instructions.map(x => x.name);
    const withInstrNames = withOpt.functions[0].body.instructions.map(x => x.name);

    t.deepEqual(withoutInstrNames, ["i32.const", "local.set", "local.get"]);
    t.deepEqual(withInstrNames, ["i32.const", "local.tee"]);
}, `
int test() {
    int a = 3;
    return a;
}
`);

// regression test for peephole_constant_if - check it doesn't completely remove constant if instructions which are
// branched too, which are generated when `break` is used inside a (constant condition) while loop.
test("peephole_constant_if regression1", async t => {
    const {test} = await compileSnippet(`
int test(int a) {
  while (1) {
    if (a >= 10) break;
    if (a >= 20) {
      // clearly this shouldn't happen - so there is a problem
      return -1;
    }
    a++;
  }
  return a;
}`).execute({}) as {test: (n: number) => number};

    t.is(test(1), 10);
    t.is(test(24), 24);
});
