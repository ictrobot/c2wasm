import test from "ava";
import {compile} from "../../src/compile";

test("basic type error", t => {
    t.throws(() => compile(`
void f(int* ptr);

void main() {
  f(42);
}
    `), {message: / int\* .* int /});
});

test("pointer type error", t => {
    t.throws(() => compile(`
void f(int** ptr);

void main() {
  signed x;
  f(&x);
}
    `), {message: / int\*\* .* int\* /});
});

test("struct type error", t => {
    t.throws(() => compile(`
void f(struct {int x, y;} point);

void main() {
  union {int i; float f;} x;
  f(x);
}
    `), {message: / struct {int x; int y;} .* union {int i; float f;} /});
});
