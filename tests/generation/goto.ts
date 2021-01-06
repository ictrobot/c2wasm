import test from "ava";
import {compile, compileSnippet} from "../../src/compile";


test("breaking out of 2 loops", async t => {
    let output = "";

    const {main} = await compile(`
#include <stdio.h>

void main() {
  for (int i = 1; i < 10; i++) {
    for (int j = 1; j < i; j++) {
      printf("%d + %d = %d\\n", i, j, i + j);
      if (i + j >= 10) goto end;
    }
  }
  end: printf("done!");
}`).execute({c2wasm: {
        __put_char: (n: number) => output += String.fromCharCode(n)
    }}) as {main: () => void};

    main();
    t.is(output, `2 + 1 = 3
3 + 1 = 4
3 + 2 = 5
4 + 1 = 5
4 + 2 = 6
4 + 3 = 7
5 + 1 = 6
5 + 2 = 7
5 + 3 = 8
5 + 4 = 9
6 + 1 = 7
6 + 2 = 8
6 + 3 = 9
6 + 4 = 10
done!`);
});

test("error handler pattern", async t => {
    const {test} = await compileSnippet(`
int test(int a) {
  if (a % 2 == 1) goto error;
  a /= 2;
  if (a > 10) goto error;

  // success
  return 0;

  error:
  return -a;
}`).execute({}) as {test: (n: number) => number};

    const correct = [0, -1, 0, -3, 0, -5, 0, -7, 0, -9, 0, -11, 0, -13, 0, -15, 0, -17, 0, -19, 0, -21, -11, -23, -12, -25, -13, -27, -14, -29];
    const output = correct.map((_, i) => test(i));
    t.deepEqual(correct, output);
});
