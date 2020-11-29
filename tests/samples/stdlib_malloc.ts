import test from "ava";
import {compile} from "../../src/compile";

test("stdlib.h malloc", async t => {
    let output = "";
    const {main} = await compile(`
#include <stdio.h>
#include <stdlib.h>

#define SMALLEST 32
#define HEADER 16
#define LARGE 1024 * 1024

void main() {
  const char* base = malloc(1); free(base);
  printf("base pointer: %u\\n", base);
  
  // simple re-alloc test
  char* a = malloc(1); free(a);
  if (a != base) printf("Failed! simple re-alloc a=%u\\n", a);
  else printf("simple re-alloc a=%u\\n", a);

  // allocate up to smallest allocation
  char* arr[SMALLEST] = {base - HEADER - SMALLEST};
  for (int i = 1; i < SMALLEST; i++) {
    arr[i] = malloc(i);
    if (arr[i] != arr[i - 1] + HEADER + SMALLEST) printf("Failed! up to smallest arr[%d]=%u\\n", i, arr[i]);
    else printf("allocating %d byte(s) = %u\\n", i, arr[i]);
    if ((unsigned int) arr[i] % 8 != 0) printf("Failed! not multiple of 8 arr[%d]=%u\\n", i,  arr[i]);
  }

  // free up to 256 bytes after base
  int j = 1;
  for (; arr[j] <= base + 256 && j < SMALLEST; j++) {
    free(arr[j]);
    printf("freeing arr[%d]=%u\\n", j, arr[j]);
  }

  // check that <256 bytes is allocated at base
  a = malloc(240); free(a);
  if (a != base) printf("Failed! simple re-alloc2 a=%u\\n", a);
  else printf("simple re-alloc2 a=%u\\n", a);

  // check that large allocated after
  a = malloc(LARGE); free(a);
  if (a == base || a != arr[SMALLEST - 1] + SMALLEST + HEADER) printf("Failed! large alloc a=%u\\n", a);
  else printf("large alloc a=%u\\n", a);

  // free remaining
  for (; j < SMALLEST; j++) {
    free(arr[j]);
    printf("freeing arr[%d]=%u\\n", j, arr[j]);
  }

  // check that large now allocated at base
  a = malloc(LARGE); free(a);
  if (a != base) printf("Failed! large alloc2 a=%u\\n", a);
  else printf("large alloc2 a=%u\\n", a);
  
  printf("finished\\n");
}
    `).execute({
        c2wasm: {
            __put_char: (n: number) => {
                output += String.fromCharCode(n);
            }
        }
    }) as {
        main: () => number
    };

    main();
    t.assert(output.indexOf("finished\n") > 0);
    t.assert(output.indexOf("Failed!") < 0);
});
