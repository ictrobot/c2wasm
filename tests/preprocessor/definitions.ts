import test from "ava";
import {Preprocessor} from "../../src/preprocessor";

test("simple macro", async t => {
    const preprocessor = new Preprocessor();
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
    const preprocessor = new Preprocessor();
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
