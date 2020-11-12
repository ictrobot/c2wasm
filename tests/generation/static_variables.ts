import test from "ava";
import {compile} from "../../src/generation";

test("static int", async t => {
    const c = await compile(`
        static int test = 0;
    
        int post() { return test++; }
        int pre() { return ++test; }
        void reset() { test = 0; }
    `).execute({}) as {
        post: () => number,
        pre: () => number,
        reset: () => number
    };

    for (let i = 0; i < 10; i++) t.is(c.post(), i);
    c.reset();
    for (let i = 1; i < 10; i++) t.is(c.pre(), i);
});

test("static int[]", async t => {
    const c = await compile(`
        static int arr[] = {1,2,3,4,5,6};
    
        int test(int multiplier) {
           int output = 0;
           for (int i = 0; i < sizeof(arr) / sizeof(int); i++) {
               output = output + arr[i];
               arr[i] = arr[i] * multiplier;
           }
           return output;
        }
    `).execute({}) as {
        test: (n: number) => number
    };

    t.is(c.test(2), 21);
    t.is(c.test(3), 42);
    t.is(c.test(1), 126);
    t.is(c.test(0), 126);
    t.is(c.test(0), 0);
});
