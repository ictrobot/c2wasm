import test from "ava";
import {compileSnippet} from "../../src/compile";
import {i32Type} from "../../src/wasm";

test("scoped local reuse", async t => {
    const module = await compileSnippet(`
        import void action(int a);
        
        void test() {
          for (int i = 0; i++; i < 10) {
            action(i);
          }
          for (int j = 0; j++; j < 10) {
            action(j);
          }
          
        }
    `);

    t.is(module.functions.length, 1);
    t.deepEqual(module.functions[0].locals, [i32Type]);
});
