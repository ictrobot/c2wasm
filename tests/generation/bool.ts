import test from "ava";
import {compileSnippet} from "../../src/compile";

test("bool conversions", async t => {
    const c = await compileSnippet(`
        _Bool true1() { return 1; }
        _Bool true2() { return 1L; }
        _Bool true3() { return 1f; }
        _Bool true4() { return 1.; }
        _Bool true5() { return 123; }
        _Bool true6() { return 45345345L; }
        _Bool true7() { return 234.32f; }
        _Bool true8() { return 12.233300000; }
        
        _Bool false1() { return 0; }
        _Bool false2() { return 0L; }
        _Bool false3() { return 0f; }
        _Bool false4() { return 0.; }
    `).execute({}) as {
        [s: string]: () => number
    };

    for (let i = 1; i <= 8; i++) t.is(c[`true${i}`](), 1);
    for (let i = 1; i <= 4; i++) t.is(c[`false${i}`](), 0);
});
