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
        Instructions.call_indirect(b.parent.typeIndex([[f64Type, f64Type], [f64Type]]))
    ], "math");

    const {math} = await m.execute({}) as {math: (op: number, v1: number, v2: number) => number};

    t.is(math(add, 1, 2), 3);
    t.is(math(mul, 1, 2), 2);

    t.is(math(add, 5, 100), 105);
    t.is(math(mul, 5, 100), 500);
});
