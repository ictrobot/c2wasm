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
