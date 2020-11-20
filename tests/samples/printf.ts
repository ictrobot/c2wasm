import test from "ava";
import {compile} from "../../src/compile";

test("printf", async t => {
    let output = "";

    const {main} = await compile(`
#include <stdio.h>

long factorial(unsigned int v) {
  return v < 2 ? 1 : v * factorial(v - 1);
}

void main() {
  for (int i = 0; i < 21; ++i) {
    printf("%d %llu\\n", i, factorial(i));
  }
}   
    `).execute({
        c2wasm: {
            __put_char: (char: number) => {
                output += String.fromCharCode(char);
            }
        }
    }) as {
        main: () => void
    };

    main();
    t.deepEqual(output, `0 1
1 1
2 2
3 6
4 24
5 120
6 720
7 5040
8 40320
9 362880
10 3628800
11 39916800
12 479001600
13 6227020800
14 87178291200
15 1307674368000
16 20922789888000
17 355687428096000
18 6402373705728000
19 121645100408832000
20 2432902008176640000\n`);

});

test("nested variadic", async t => {
    let output = "";

    const {main} = await compile(`
#include <stdio.h>

void main() {
  char x[10];
  printf("%i hello %s world %i", 123, ( sprintf(x, "%i", 456), x), 789);
}
    `).execute({
        c2wasm: {
            __put_char: (char: number) => {
                output += String.fromCharCode(char);
            }
        }
    }) as {
        main: () => void
    };

    main();
    t.deepEqual(output, `123 hello 456 world 789`);

});

test("function pointer and nested", async t => {
    let output = "";

    const {main} = await compile(`
#include <stdio.h>
#include <stdarg.h>

typedef int (*funcptr)(const char*, ...);

funcptr p(const char* x, ...) {
   va_list a;
   va_start(a, x);
   vprintf(x, a);
   va_end(a);
   return &printf;
}

void main() {
  char x[10];
  (p("%s%i\\n", "testing", 3210))("%i hello %s world %i", 123, ( sprintf(x, "%i", 456), x), 789);
}
    `).execute({
        c2wasm: {
            __put_char: (char: number) => {
                output += String.fromCharCode(char);
            }
        }
    }) as {
        main: () => void
    };

    main();
    t.deepEqual(output, `testing3210\n123 hello 456 world 789`);

});
