import test from "ava";
import {ModuleBuilder, Instructions, i32Type, f64Type, i64Type} from "../../src/wasm";

test("call_indirect", async t => {
    const m = new ModuleBuilder();
    const add = Number(m.function([f64Type, f64Type], [f64Type], b => [
        Instructions.local.get(b.args[0]),
        Instructions.local.get(b.args[1]),
        Instructions.f64.add()
    ]).getTableIndex());
    const mul = Number(m.function([f64Type, f64Type], [f64Type], b => [
        Instructions.local.get(b.args[0]),
        Instructions.local.get(b.args[1]),
        Instructions.f64.mul()
    ]).getTableIndex());


    m.function([i32Type, f64Type, f64Type], [f64Type], (b) => [
        Instructions.local.get(b.args[1]),
        Instructions.local.get(b.args[2]),
        Instructions.local.get(b.args[0]),
        Instructions.call_indirect(b.fn.parent._typeIndex([[f64Type, f64Type], [f64Type]]))
    ], "math");

    const {math} = await m.execute({}) as {math: (op: number, v1: number, v2: number) => number};

    t.is(math(add, 1, 2), 3);
    t.is(math(mul, 1, 2), 2);

    t.is(math(add, 5, 100), 105);
    t.is(math(mul, 5, 100), 500);
});

test("call_indirect imported function", async t => {
    const m = new ModuleBuilder();
    const random = m.importFunction([], [f64Type], "testing", "random");
    m.global(i32Type, false, random.getTableIndex(), "randomFn");
    m.function([i32Type, f64Type, f64Type], [f64Type], (b) => [
        Instructions.local.get(b.args[0]),
        Instructions.call_indirect(m._typeIndex([[], [f64Type]])),
        Instructions.local.get(b.args[2]),
        Instructions.local.get(b.args[1]),
        Instructions.f64.sub(),
        Instructions.f64.mul(),
        Instructions.local.get(b.args[1]),
        Instructions.f64.add()
    ], "uniform");

    const {uniform, randomFn} = await m.execute({
        testing: {random: () => Math.random()}
    }) as {uniform: (fn: number, min: number, max: number) => number, randomFn: WebAssembly.Global};

    for (let i = 0; i < 100; i++) {
        const value = uniform(randomFn.value, i, i + 10);
        t.assert(value >= i && value <= i + 10);
    }
});
