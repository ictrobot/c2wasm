import test from "ava";
import {compileSnippet} from "../../src/compile";

test("factorial", async t => {
    const {factorial} = await compileSnippet(`
        long int factorial(unsigned int v) {
          return v < 2 ? 1 : v * factorial(v - 1);
        }
    `).execute({}) as {
        factorial: (n: number) => bigint
    };

    t.is(factorial(0), 1n);
    t.is(factorial(3), 6n);
    t.is(factorial(5), 120n);
    t.is(factorial(20), 2432902008176640000n);
});
