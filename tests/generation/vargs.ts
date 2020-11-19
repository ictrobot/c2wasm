import test from "ava";
import {compile} from "../../src/compile";

test("integer vargs", async t => {
    const values: number[] = [];

    const c = await compile(`
#include <stdarg.h>

import void print(int);

int test(int n, ...) {
  va_list l, l2;
  va_start(l, n);
  for (int i = 0; i < n; i++) {
    int x = va_arg(l, int);
    print(x);
  }
  va_end(l);
  return n;
}

void main() {
  test(0);
  test(1, 0);
  test(2, 1, 2);
  test(3, 3, 4, 5);
  test(7, 6, 7, 8, 9, 10, 11, 12);
}`).execute({
        c2wasm: {print: (x: number) => values.push(x)}
    }) as {
        main: () => void
    };

    c.main();
    t.deepEqual(values, Array(13).fill(0).map((_, i) => i));
});

test("struct vargs", async t => {
    const values: number[] = [];

    const c = await compile(`
#include <stdarg.h>

import void print(int);

struct pair {
  int a;
  int b;
};

int test(int n, ...) {
  va_list l, l2;
  va_start(l, n);
  for (int i = 0; i < n; i++) {
    struct pair p = va_arg(l, struct pair);
    print(p.a);
    print(p.b);
  }
  va_end(l);
  return n;
}

void main() {
  struct pair a = {1,2}, b = {3,4}, c = {5, 6}, d = {12, 345};

  test(1, a);
  test(3, b, c, d);
}`).execute({
        c2wasm: {print: (x: number) => values.push(x)}
    }) as {
        main: () => void
    };

    c.main();
    t.deepEqual(values, [1,2,3,4,5,6,12,345]);
});
