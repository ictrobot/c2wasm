import test from "ava";
import {mainWrapper} from "../../src/c_library/runtime/args";
import {compile, compileSnippet} from "../../src/compile";


test("argc", async t => {
    const exports = await compileSnippet(`
int main(int argc, char *argv[]) {
    return argc;
}`).execute({});

    t.is(0, mainWrapper(exports, []));
    t.is(1, mainWrapper(exports, ["Test"]));
    t.is(2, mainWrapper(exports, ["Hello", "World"]));
});

test("argv", async t => {
    let output = "";

    const exports = await compile(`
#include <stdio.h>
    
int main(int argc, char *argv[]) {
    for (int i = 0; i < argc; i++) {
      puts(argv[i]);
    }
    return 0;
}`).execute({
        c2wasm: {
            __put_char: (x: number) => output += String.fromCharCode(x)
        }
    });

    mainWrapper(exports, []);
    t.is(output, "");

    mainWrapper(exports, ["Hello World", "This is a test"]);
    t.is(output, "Hello World\nThis is a test\n");
    output = "";

    mainWrapper(exports, ["A", "BC", "DEF"]);
    t.is(output, "A\nBC\nDEF\n");
    output = "";
});

test("stack pointer", async t => {
    const exports = await compileSnippet(`
int main(int argc, char *argv[]) {
    char *x = argv[argc - 1];
    while (*x) x++;
    char* stackPointer = (char*) __wasm_i32__(0, 0x23, 0); // global.get 0
    return (int) (stackPointer - x);
}`).execute({});

    t.assert(mainWrapper(exports, ["Testing123"]) > 0, "Stack pointer after arguments");
});
