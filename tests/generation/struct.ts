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

test("as parameter and return value", async t => {
    const values: number[] = [];

    const c = await compile(`
        extern void print(int a, int b);

        struct pair{int a; int b;};
        
        struct pair doublePair(struct pair in) {
          struct pair out = {in.a * 2, in.b * 2};
          return out;
        }
        
        void main() {
          struct pair myPair = {42,57};
          myPair = doublePair(myPair);
          print(myPair.a, myPair.b);
        }
    `).execute({
        extern: {
            print: (a: number, b: number) => values.push(a, b)
        }
    }) as {
        main: () => void
    };

    c.main();
    t.deepEqual(values, [84, 114]);
});
