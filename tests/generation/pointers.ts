import test from "ava";
import {compileSnippet} from "../../src/compile";

pointerTest("static pointer access", [34], `
void test() {
    static int i = 34;
    int* ptr = &i;
    log(i);
}
`);

pointerTest("local pointer access", [34], `
void test() {
    int i = 34;
    int* ptr = &i;
    log(i);
}
`);

pointerTest("modification through pointer", [34, 35], `
void test() {
    int i = 34;
    int* ptr = &i;
    
    log(i);
    (*ptr)++;
    log(i);
}
`);

pointerTest("pointer as fn argument", [12, 13, 14, 15], `
void increment(int* x) {
  (*x)++;
}

void test() {
    int i = 12;
    
    log(*(&i));
    increment(&i);
    log(i);
    i = i + 1;
    log(i);
    increment(&i);
    log(i);
}
`);

pointerTest("shadow stack", [512, 516, 520, 524, 528], `
    void fn(int i) {
      int x = i;
      log((int) &x);
      if (i > 0) fn(--i);
    }
    
    void test() {
        fn(4);
    }
`);

function pointerTest<T>(name: string, expected: T[], cSource: string) {
    test(name, async t => {
        const values: T[] = [];

        const {test} = await compileSnippet("import void log(int output);\n\n" + cSource).execute({
            c2wasm: {
                log: (n: T) => values.push(n)
            }
        }) as {
            test: () => void
        };

        test();
        t.deepEqual(values, expected);
    });
}
