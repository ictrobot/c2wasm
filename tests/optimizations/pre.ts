import {InstrInstance} from "../../src/wasm/instr_helpers";
import {optimizationTest, countInstructions} from "./index";

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
