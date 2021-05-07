import {getDefaultFlags} from "../../src";
import {i32Type} from "../../src/wasm";
import {optimisationTest} from "./index";

optimisationTest("simple inline", {
    inlining: true,
    peephole_unused_blocks: true
}, (t, withoutOpt, withOpt) => {
    t.is(withoutOpt.functions.length, 2);

    t.is(withOpt.functions.length, 1);
    t.like(withOpt.functions[0].body.instructions[0], {
        type: "constant",
        name: "i32.const",
        immediate: {
            value: 4n
        }
    });
}, `
static int randomNumber() {
  return 4; // chosen by fair dice roll, https://xkcd.com/221/
}

int main() {
  return randomNumber();
}
`);

optimisationTest("doesn't remove exported functions", {
    inlining: true,
    peephole_unused_blocks: true
}, (t, withoutOpt, withOpt) => {
    t.is(withoutOpt.functions.length, 2);

    t.is(withOpt.functions.length, 2); // randomNumber is now exported, so can be inlined but not removed
    t.like(withOpt.functions[0].body.instructions[0], {
        type: "constant",
        name: "i32.const",
        immediate: {
            value: 4n
        }
    });
}, `
int randomNumber() {
  return 4;
}

int main() {
  return randomNumber();
}
`);

optimisationTest("with parameters", {
    ...getDefaultFlags(),
    inlining: true
}, (t, withoutOpt, withOpt) => {
    t.is(withoutOpt.functions.length, 2);

    t.is(withOpt.functions.length, 1);
    t.like(withOpt.functions[0].body.instructions[0], {
        type: "constant",
        name: "i32.const",
        immediate: {
            value: 20n
        }
    });
}, `
static int add(int a, int b) {
  return a + b;
}

int main() {
  return add(4, 16);
}
`);

optimisationTest("extra return", {
    ...getDefaultFlags(),
    inlining: true
}, (t, withoutOpt, withOpt) => {
    t.is(withoutOpt.functions.length, 2);

    t.is(withOpt.functions.length, 1);
    t.is(withOpt.functions[0].body.instructions.length, 1);
    t.like(withOpt.functions[0].body.instructions[0], {
        name: "block",
        result: i32Type
    });

    const block = withOpt.functions[0].body.instructions[0];
    if (block.type !== "structured") {
        t.fail();
        return; // this .type check is needed to make TypeScript happy
    }
    t.like(block.immediate.expression.instructions[1], {
        name: "br",
        parameters: [i32Type]
    });
}, `
static int not(int x) {
  if (x) return 0;
  return 1;
}

int test(int x) {
  return not(4);
}`);
