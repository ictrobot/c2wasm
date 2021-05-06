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

test("every type", async t => {
    const {main, __mem: mem} = await compile(`
#include <stdbool.h>

struct demo {
  char string[20];
  unsigned char a;
  signed char b;
  unsigned short c;
  signed short d;
  unsigned int e;
  signed int f;
  unsigned long g;
  signed long h;
  float i;
  double j;
  bool k;
} var = {"Hello World", 123, -5, 2344, 2134, 9898989, -1234323, 1152921504606846976, -1152921504606846976, 1.5f, 0.1f, true};

int main() {
  return (int) &var;
}
    `).execute({}) as {
        main: () => number,
        __mem: WebAssembly.Memory
    };

    const addr = main();
    const u8mem = new Uint8Array(mem.buffer);

    const expected = [72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 123, 251, 40, 9, 86, 8, 0, 0, 237, 11, 151, 0, 109, 42, 237, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 16, 0, 0, 0, 0, 0, 0, 0, 240, 0, 0, 192, 63, 0, 0, 0, 0, 154, 153, 153, 153, 153, 153, 185, 63, 1];
    const actual = [];
    for (let i = 0; i < expected.length; i++) {
        actual.push(u8mem[addr + i]);
    }

    t.deepEqual(actual, expected);
});

test("union initializer", async t => {
    const {main, getDouble, __mem: mem} = await compile(`
#include <stdbool.h>

union demo {
    long l;
    double d;
} var = {1152921504606846976};

int main() {
  return (int) &var;
}

double getDouble() {
    return var.d;
}
    `).execute({}) as {
        main: () => number,
        getDouble: () => number
        __mem: WebAssembly.Memory
    };

    const addr = main();
    const u8mem = new Uint8Array(mem.buffer);

    const expected = [0, 0, 0, 0, 0, 0, 0, 16];
    const actual = [];
    for (let i = 0; i < expected.length; i++) {
        actual.push(u8mem[addr + i]);
    }

    t.deepEqual(actual, expected);

    // check that getDouble() == 1.288229753919427e-231 within epsilon
    t.assert(Math.abs(getDouble() - 1.288229753919427e-231) < 1e-100);
});
