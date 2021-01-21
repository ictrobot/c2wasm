import test, {ExecutionContext} from "ava";
import {compileSnippet} from "../../src/compile";
import {OptimizationFlags, setFlags} from "../../src/optimization/flags";
import {ModuleBuilder, WExpression, i32Type} from "../../src/wasm";
import {InstrInstance} from "../../src/wasm/instr_helpers";

optimizationTest("pre_do_loop", {partial_redundancy_elimination: true}, (t, withoutOpt, withOpt) => {
    // without should have two adds in the loop
    const top1 = withoutOpt.functions[0].body;
    const block1 = (top1.instructions[0] as InstrInstance & {type: "structured"}).immediate.expression;
    const loop1 = (block1.instructions[0] as InstrInstance & {type: "structured"}).immediate.expression;
    t.is(2, countInstructions("i32.add", loop1, false));

    // pre should have one add at the top level before the loop and one in the if statement
    const top2 = withOpt.functions[0].body;
    t.is(1, countInstructions("i32.add", top2, false));
    const block2 = (top2.instructions[4] as InstrInstance & {type: "structured"}).immediate.expression;
    const loop2 = (block2.instructions[0] as InstrInstance & {type: "structured"}).immediate.expression;
    t.is(1, countInstructions("i32.add", loop2, true));
}, `
int test(int a, int b) {
  int sum;
  do {
    sum = a + b;
    if (sum > 100) a--;
    sum = a + b;
  } while(sum > 100);
  return sum;
}`);

test("scoped local reuse", async t => {
    const module = compileSnippet(`
        import void action(int a);
        
        void test() {
          for (int i = 0; i++; i < 10) {
            action(i);
          }
          for (int j = 0; j++; j < 10) {
            action(j);
          }
          
        }
    `);

    t.is(module.functions.length, 1);
    t.deepEqual(module.functions[0].locals, [i32Type]);
});

// helpers

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
