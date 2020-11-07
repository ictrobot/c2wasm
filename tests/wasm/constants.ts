import test from "ava";
import {ModuleBuilder, Instructions, i64Type} from "../../src/wasm";

test("32bit unsigned constant", async t => {
    const m = new ModuleBuilder();
    m.setupMemory(1, 1);

    const unsignedValue = (2n ** 32n) - 1024n;
    m.function([], [i64Type], () => [
        Instructions.i32.const(unsignedValue),
        Instructions.i64.extend_i32_u()
    ], "getAsUnsigned");
    m.function([], [i64Type], () => [
        Instructions.i32.const(unsignedValue),
        Instructions.i64.extend_i32_s()
    ], "getAsSigned");

    const {getAsUnsigned, getAsSigned} = await m.execute({}) as {
        getAsUnsigned: () => bigint,
        getAsSigned: () => bigint
    };

    t.deepEqual(getAsUnsigned(), unsignedValue);
    t.deepEqual(getAsSigned(), unsignedValue - (2n ** 32n));
});

test("64bit unsigned constant", async t => {
    const m = new ModuleBuilder();
    m.setupMemory(1, 1);

    const unsignedValue = (2n ** 64n) - 1249413n;
    m.function([], [i64Type], () => [
        Instructions.i64.const(unsignedValue),
        Instructions.i64.const(1000n),
        Instructions.i64.rem_u()
    ], "getAsUnsigned");
    m.function([], [i64Type], () => [
        Instructions.i64.const(unsignedValue),
        Instructions.i64.const(1000n),
        Instructions.i64.rem_s()
    ], "getAsSigned");

    const {getAsUnsigned, getAsSigned} = await m.execute({}) as {
        getAsUnsigned: () => bigint,
        getAsSigned: () => bigint
    };

    t.deepEqual(getAsUnsigned(), unsignedValue % 1000n);
    t.deepEqual(getAsSigned(), (unsignedValue - (2n ** 64n)) % 1000n);
});
