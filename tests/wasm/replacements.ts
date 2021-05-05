import test from "ava";
import {WFunctionBuilder, WExpression, ModuleBuilder, i32Type, Instructions} from "../../src/wasm";

async function f(m: ModuleBuilder, x: number) {
    const {f} = await m.execute({}) as {f: (x: number) => number};
    return f(x);
}

test("simple instruction replacement", async t => {
    const m = new ModuleBuilder();
    const fFn = m.function([i32Type], [i32Type], (b: WFunctionBuilder) => [
        Instructions.local.get(b.args[0]),
        Instructions.i32.const(10),
        Instructions.i32.add()
    ], "f");

    t.is(await f(m, 5), 15);

    fFn.body.replace(2, 3, Instructions.i32.mul());
    t.is(await f(m, 5), 50);

    fFn.body.replace(2, 3, Instructions.i32.rem_s());
    t.is(await f(m, 103), 3);
});

test("stack doesn't match", async t => {
    const m = new ModuleBuilder();
    const fFn = m.function([i32Type], [i32Type], (b: WFunctionBuilder) => [
        Instructions.local.get(b.args[0]),
        Instructions.i32.const(10),
        Instructions.i32.add()
    ], "f");

    t.is(await f(m, 5), 15);

    t.throws(() => fFn.body.replace(2, 3, Instructions.i32.eqz()));
});

test("consume invalid values", async t => {
    const m = new ModuleBuilder();
    const fFn = m.function([i32Type], [i32Type], (b: WFunctionBuilder) => [
        Instructions.local.get(b.args[0]),
        Instructions.i32.const(10),
        Instructions.i32.add()
    ], "f");

    t.is(await f(m, 5), 15);

    t.throws(() => fFn.body.replace(2, 3, Instructions.drop(), Instructions.drop(), Instructions.drop()));
});

test("consumes incorrect type", async t => {
    const m = new ModuleBuilder();
    const fFn = m.function([i32Type], [i32Type], (b: WFunctionBuilder) => [
        Instructions.local.get(b.args[0]),
        Instructions.i32.const(10),
        Instructions.i32.add()
    ], "f");

    t.is(await f(m, 5), 15);

    t.throws(() => fFn.body.replace(2, 3, Instructions.drop(), Instructions.i32.reinterpret_f32()));
});
