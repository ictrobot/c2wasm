import test from "ava";
import {ModuleBuilder, Instructions, i32Type, i64Type} from "../../src/wasm";

test("immutable global", async t => {
    const m = new ModuleBuilder();
    const g = m.global(i32Type, false, 457);

    m.function([], [i32Type], () => [
        Instructions.global.get(g)
    ], "getValue");

    const {getValue} = await m.execute({}) as {
        getValue: () => number
    };

    t.is(getValue(), 457);
});

test("mutable global", async t => {
    const m = new ModuleBuilder();
    const g = m.global(i32Type, true, 0);

    m.function([], [i32Type], () => [
        Instructions.global.get(g),
        Instructions.i32.const(1),
        Instructions.i32.add(),
        Instructions.global.set(g),
        Instructions.global.get(g)
    ], "increment");

    const {increment} = await m.execute({}) as {
        increment: () => number
    };

    for (let i = 1; i <= 10; i++) t.is(increment(), i);
});

test("exporting global", async t => {
    const m = new ModuleBuilder();
    const g = m.global(i64Type, true, 0n, "myGlobal");

    m.function([], [i64Type], () => [
        Instructions.global.get(g),
        Instructions.i64.const(1n),
        Instructions.i64.add(),
        Instructions.global.set(g),
        Instructions.global.get(g)
    ], "increment");

    const {increment, myGlobal} = await m.execute({}) as {
        increment: () => bigint,
        myGlobal: WebAssembly.Global
    };

    for (let i = 1n; i <= 3n; i++) t.is(increment(), i);
    myGlobal.value = 5231n;
    for (let i = 5232n; i <= 5240n; i++) t.is(increment(), i);
});
