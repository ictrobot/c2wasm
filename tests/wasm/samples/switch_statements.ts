import test from "ava";
import {ModuleBuilder, i32Type, Instructions} from "../../../src/wasm";
import {labelidx} from "../../../src/wasm/base_types";

test("br_table", async t => {
    const m = new ModuleBuilder();

    /* something like:
          switch (x) {
            case 1:
            case 2:
            case 3:
              return 100;
            case 4:
              return 50;
            case 5:
              return 20;
            case 6:
             return 10;
            case 7:
            default:
              return 0;
            case 8:
              return 75;
          }
     */
    m.function([i32Type], [i32Type], (b) => [
        Instructions.block(null, [ // 5
            Instructions.block(null, [ // 4
                Instructions.block(null, [ // 3
                    Instructions.block(null, [ // 2
                        Instructions.block(null, [ // 1
                            Instructions.block(null, [ // 0
                                Instructions.local.get(b.args[0]),
                                Instructions.br_table(4n as labelidx, [4n, 0n, 0n, 0n, 1n, 2n, 3n, 4n, 5n] as labelidx[])
                            ]),
                            Instructions.i32.const(100),
                            Instructions.return()
                        ]),
                        Instructions.i32.const(50),
                        Instructions.return()
                    ]),
                    Instructions.i32.const(20),
                    Instructions.return()
                ]),
                Instructions.i32.const(10),
                Instructions.return()
            ]),
            Instructions.i32.const(0),
            Instructions.return()
        ]),
        Instructions.i32.const(75),
        Instructions.return()
    ], "f");

    const {f} = await m.execute({}) as {f: (x: number) => number};

    const expected = [0, 100, 100, 100, 50, 20, 10, 0, 75, 0, 0, 0, 0, 0, 0, 0];
    const output = expected.map((_, i) => f(i));
    t.deepEqual(output, expected);
});
