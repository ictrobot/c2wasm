import test from "ava";
import {compile, compileSnippet} from "../../src/compile";

test("array initializer", async t => {
    const values: number[] = [];

    const {main} = await compileSnippet(`
        import void log(int a);
        
        void main() {
            int arr[] = {10, 7, 0, 8, 9, 1, -7, 5, 1234, 23};
            int length = sizeof(arr) / sizeof(int);
            for (int i = 0; i < length; i++) log(arr[i]);
        }
    `).execute({
        c2wasm: {
            log: (n: number) => values.push(n)
        }
    }) as {
        main: () => void
    };

    main();
    t.deepEqual(values, [10, 7, 0, 8, 9, 1, -7, 5, 1234, 23]);
});

test("string literal in initializer", async t => {
    let output = "";

    const {main} = await compile(`
#include <stdio.h>
struct {
  char x[5], y[5];
} myStrings = {"aaaa", "bbb"};

void main() { puts(myStrings.x); }
    `).execute({
        c2wasm: {
            __put_char: (n: number) => output += String.fromCharCode(n)
        }
    }) as {
        main: () => void
    };

    main();
    t.deepEqual(output, "aaaa\n");
});
