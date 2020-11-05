import test from "ava";
import {ModuleBuilder, Instructions, i64Type, i32Type} from "../../src/wasm";

test("simple factorial function", async t => {
    const m = new ModuleBuilder();
    m.function([i64Type], [i64Type], (b) => [
        Instructions.local.get(b.args[0]),
        Instructions.i64.const(0n),
        Instructions.i64.gt_s(),
        Instructions.if(i64Type, [
            Instructions.local.get(b.args[0]),
            Instructions.i64.const(1n),
            Instructions.i64.sub(),
            Instructions.call(b.self),
            Instructions.local.get(b.args[0]),
            Instructions.i64.mul()
        ], [
            Instructions.i64.const(1n)
        ])
    ], "factorial");

    const {factorial} = await m.execute({}) as {factorial: (n: bigint) => bigint};

    t.deepEqual(factorial(0n), 1n);
    t.deepEqual(factorial(3n), 6n);
    t.deepEqual(factorial(5n), 120n);
    t.deepEqual(factorial(20n), 2432902008176640000n);
});

test("imports", async t => {
    const m = new ModuleBuilder();
    const testFn = m.importFunction([i32Type], [], "imports", "test");
    m.function([], [], (b) => [
        Instructions.i32.const(45n),
        Instructions.i32.const(2n),
        Instructions.i32.add(),
        Instructions.call(testFn)
    ], "test");

    let value: any = undefined;
    const {test} = await m.execute({
        imports: {
            test: (x: number) => {
                value = x;
            }
        }
    }) as {test: () => void};

    test();
    t.deepEqual(value, 47);
});
