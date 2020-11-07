import test from "ava";
import {ModuleBuilder, i32Type, Instructions} from "../../src/wasm";

test("start function", async t => {
    const m = new ModuleBuilder();
    m.setupMemory(1, 1);
    m.startFunction = m.function([], [], () => [
        Instructions.i32.const(0),
        Instructions.i32.const(7654321),
        Instructions.i32.store(0, 0),
    ]);
    m.function([], [i32Type], () => [
        Instructions.i32.const(0),
        Instructions.i32.load(0, 0)
    ], "getValue");


    const {getValue} = await m.execute({}) as {
        getValue: () => number
    };

    t.deepEqual(getValue(), 7654321);
});

test("invalid start function", async t => {
    const m = new ModuleBuilder();
    m.startFunction = m.function([], [], () => [
        Instructions.unreachable()
    ]);

    await t.throwsAsync(() => m.execute({}));
});
