import test from "ava";
import {compileSnippet} from "../../src/compile";

test("function returning int constant", async t => {
    const c = await compileSnippet(`
        int intTest() {
            return 35;
        }
    `).execute({}) as {
        intTest: () => number
    };

    t.deepEqual(c.intTest(), 35);
});

test("function returning double constant", async t => {
    const c = await compileSnippet(`
        double doubleTest() {
            return 1.34e13;
        }
    `).execute({}) as {
        doubleTest: () => number
    };

    t.is(c.doubleTest(), 1.34e13);
});
