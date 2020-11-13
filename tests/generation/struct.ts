import test from "ava";
import {compile} from "../../src/generation";

test("struct copy", async t => {
    const c = await compile(`
        struct test{long padding; long padding2; int value;};

        int test() {
          struct test a = {123, 456, 42};
          struct test b = {33, 33, 33};
          b = a;
          a.value = 35;
          return b.value;
        }
    `).execute({}) as {
        test: () => number
    };

    t.is(c.test(), 42);
});
