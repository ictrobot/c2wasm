import test from "ava";
import {ModuleBuilder, Instructions, i32Type, i64Type} from "../../src/wasm";

test("data segment", async t => {
    const m = new ModuleBuilder();
    m.setupMemory(1, 1);
    m.dataSegment(0, [1, 2, 3, 4]);

    m.function([], [i32Type], () => [
        Instructions.i32.const(0),
        Instructions.i32.load(0, 0)
    ], "getValue");

    const {getValue} = await m.execute({}) as {
        getValue: () => number
    };

    t.deepEqual(getValue(), 67305985);
});

test("multiple data segments", async t => {
    const m = new ModuleBuilder();
    m.setupMemory(1, 1);
    m.dataSegment(0, [1, 2]);
    m.dataSegment(2, [3, 4, 5, 6, 7, 8]);

    m.function([], [i64Type], () => [
        Instructions.i32.const(0),
        Instructions.i64.load(0, 0)
    ], "getValue");

    const {getValue} = await m.execute({}) as {
        getValue: () => bigint
    };

    t.deepEqual(getValue(), 578437695752307201n);
});
