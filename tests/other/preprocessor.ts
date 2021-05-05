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

test("conditional types", t => {
    const preprocessor = new Preprocessor("main.c");

    t.notThrows(() => preprocessor.process(`
#define A 15
#define B 3

#if A + B != 18
#error add
#endif

#if A - B != 12
#error sub
#endif

#if A * B != 45
#error mul
#endif

#if A / B != 5
#error div
#endif

#if A & B != 3
#error bitwise and
#endif

#if (A | B) != 15
#error bitwise or
#endif

#if (A ^ B) != 12
#error bitwise xor
#endif

#if A << B != 120
#error left shift
#endif

#if A >> B != 1
#error right shift
#endif

#if A == B
#error equality
#endif

#if A != A
#error not equal
#endif

#if A < B
#error less than
#endif

#if A <= B
#error less than or equal
#endif

#if B > A
#error greater than
#endif

#if B >= A
#error greater than or equal
#endif

#if B && A
#else
#error logical and
#endif

#if A < 10 || B > 20
#error logical or
#endif

#if A != +A
#error unary plus
#endif

#if -A != -15
#error unary minus
#endif

#if !A
#error logical not
#endif`));
});

test("invalid conditionals", t => {
    const preprocessor = new Preprocessor("main.c");

    // conditions parsed using
    //      parse(`int x = ${x};`);

    t.throws(() => preprocessor.process(`
#if 5, y = 10
Hi
#endif`));

    t.throws(() => preprocessor.process(`
#if {5,10}
Hi
#endif`));

    t.throws(() => preprocessor.process(`
#define A 5
#if A = 4
Hi
#endif`));
});

test("custom definitions", t => {
    const preprocessor1 = new Preprocessor("main.c", false, {
        "IN_TEST": "true"
    });
    t.is(preprocessor1.process(`
int isTest() {
#ifdef IN_TEST
  return 1;
#else
  return 0;
#endif
}`).trim(), `
int isTest() {
  return 1;
}`.trim());

    const preprocessor2 = new Preprocessor("main.c", false, {});
    t.is(preprocessor2.process(`
int isTest() {
#ifdef IN_TEST
  return 1;
#else
  return 0;
#endif
}`).trim(), `
int isTest() {
  return 0;
}`.trim());
});

test("#error", t => {
    const preprocessor = new Preprocessor("sane.c");

    t.throws(() => preprocessor.process(`
#if 1 + 1 == 2
#error sane preprocessor!
#endif`), {message: "In file 'sane.c': #error sane preprocessor!"});
});

test("unrecognised directive", t => {
    const preprocessor = new Preprocessor("sane.c");

    t.throws(() => preprocessor.process(`#randomMadeUpDirective`));
});
