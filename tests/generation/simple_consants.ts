import test from "ava";
import {compile} from "../../src/generation";

test("function returning int constant", async t => {
    const c = await compile(`
        int intTest() {
            return 35;
        }
    `).execute({}) as {
        intTest: () => number
    };

    t.deepEqual(c.intTest(), 35);
});

test("function returning double constant", async t => {
    const c = await compile(`
        double doubleTest() {
            return 1.34e13;
        }
    `).execute({}) as {
        doubleTest: () => number
    };

    t.is(c.doubleTest(), 1.34e13);
});
