import test from "ava";
import {compile} from "../../src/generation";


test("simple for loop", async t => {
    const values: number[] = [];

    const {test} = await compile(`
        extern void log(int output);

        void test() {
            for (int i = 0; i < 10; i = i + 1) {
                log(i);
            }
        }
    `).execute({
        extern: {
            log: (n: number) => values.push(n)
        }
    }) as {
        test: () => void
    };

    test();
    t.deepEqual(values, [0,1,2,3,4,5,6,7,8,9]);
});
