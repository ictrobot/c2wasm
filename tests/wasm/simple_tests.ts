import test from "ava";
import {ModuleBuilder, Instructions, i64Type, i32Type} from "../../src/wasm";
import {labelidx} from "../../src/wasm/base_types";

test("i64 recursive factorial", async t => {
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

test("i32 loop factorial", async t => {
    const m = new ModuleBuilder();
    m.function([i32Type], [i32Type], (b) => [
        Instructions.local.get(b.args[0]),
        Instructions.i32.const(1n),
        Instructions.i32.le_s(),
        Instructions.if(i32Type, [
            Instructions.i32.const(1n),
        ], [
            Instructions.i32.const(1n),
            Instructions.local.set(b.addLocal(i32Type)),

            Instructions.loop(null, [
                Instructions.local.get(b.args[0]), // update local with local * arg
                Instructions.local.get(b.locals[0]),
                Instructions.i32.mul(),
                Instructions.local.set(b.locals[0]),

                Instructions.local.get(b.args[0]), // decrement arg
                Instructions.i32.const(1n),
                Instructions.i32.sub(),
                Instructions.local.tee(b.args[0]),

                Instructions.i32.const(1n), // if arg > 1 branch to start of loop
                Instructions.i32.gt_s(),
                Instructions.br_if(0n as labelidx),
            ]),
            Instructions.local.get(b.locals[0])
        ])
    ], "factorial");

    const {factorial} = await m.execute({}) as {factorial: (n: number) => number};

    t.deepEqual(factorial(0), 1);
    t.deepEqual(factorial(3), 6);
    t.deepEqual(factorial(5), 120);
    t.deepEqual(factorial(10), 3628800);
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
