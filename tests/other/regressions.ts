import test from "ava";
import {compileSnippet} from "../../src/compile";

// when generating op=, conversions weren't added after the transform which could lead to many bad things such as
// negative numbers in unsigned variables.
test("op= bounds", async t => {
    const {main} = await compileSnippet(`
int main() {
  char x = '.';
  x -= '0';
  return x;
}`).execute({}) as {main: () => number};

    t.is(main(), 254, "correctly wraps");
});
