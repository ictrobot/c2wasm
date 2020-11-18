import test from "ava";
import {Preprocessor} from "../../src/preprocessor";

test("simple macro", async t => {
    const preprocessor = new Preprocessor("main.c");
    const output = preprocessor.process(`
#define CONSTANT 42

int test() {
  return CONSTANT;
}`);

    t.is(output.trim(), `
int test() {
  return 42;
}`.trim());

});

test("macro call", async t => {
    const preprocessor = new Preprocessor("main.c");
    const output = preprocessor.process(`
#define min(X, Y) ((X) < (Y) ? (X) : (Y))

int test() {
  return min(1 + 2, 5);
}`);

    t.is(output.trim(), `
int test() {
  return ((1 + 2) < (5) ? (1 + 2) : (5));
}`.trim());

});

test("ifndef", async t => {
    const preprocessor = new Preprocessor("main.c");
    const output = preprocessor.process(`
int test() {
#ifdef min
  return min(1 + 2, 5);
#endif
#ifndef min
  return 0;
#endif
}`);

    t.is(output.trim(), `
int test() {

  return 0;
}`.trim());
});

test("ifdef", async t => {
    const preprocessor = new Preprocessor("main.c");
    const output = preprocessor.process(`
#define min(X, Y) ((X) < (Y) ? (X) : (Y))

int test() {
#ifdef min
  return min(1 + 2, 5);
#endif
}`);

    t.is(output.trim(), `
int test() {
  return ((1 + 2) < (5) ? (1 + 2) : (5));
}`.trim());
});

test("ifdef else", async t => {
    const preprocessor = new Preprocessor("main.c");
    const output = preprocessor.process(`
#define min(X, Y) ((X) < (Y) ? (X) : (Y))

int test() {
#ifndef min
  return 0;
#else
  return min(1 + 2, 5);
#endif
}`);

    t.is(output.trim(), `
int test() {
  return ((1 + 2) < (5) ? (1 + 2) : (5));
}`.trim());
});
