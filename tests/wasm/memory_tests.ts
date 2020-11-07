import test from "ava";
import {ModuleBuilder, Instructions, i64Type, i32Type} from "../../src/wasm";

async function simpleRWModule() {
    const m = new ModuleBuilder();
    m.setupMemory(1, 1);
    m.function([i32Type, i32Type], [], (b) => [
        Instructions.local.get(b.args[0]),
        Instructions.local.get(b.args[1]),
        Instructions.i32.store(0, 0)
    ], "setValue");
    m.function([i32Type], [i32Type], (b) => [
        Instructions.local.get(b.args[0]),
        Instructions.i32.load(0, 0),
    ], "getValue");

    return await m.execute({}) as {
        setValue: (address: number, n: number) => void,
        getValue: (address: number) => number
    };
}

test("read/write value", async t => {
    const {setValue, getValue} = await simpleRWModule();

    setValue(0, 12431);
    setValue(10, 3);
    setValue(20, 1000);

    t.deepEqual(getValue(0), 12431);
    t.deepEqual(getValue(10), 3);
    t.deepEqual(getValue(21), 3); // 1000 should become 0xE8 03 00 00
});

test("read/write signed value", async t => {
    const {setValue, getValue} = await simpleRWModule();

    setValue(0, 1243);
    setValue(4, -7989);
    setValue(8, -1344334);

    t.deepEqual(getValue(0), 1243);
    t.deepEqual(getValue(4), -7989);
    t.deepEqual(getValue(8), -1344334);
});

test("read as 64bit", async t => {
    const m = new ModuleBuilder();
    m.setupMemory(1, 1);
    m.function([i32Type, i32Type], [], (b) => [
        Instructions.local.get(b.args[0]),
        Instructions.local.get(b.args[1]),
        Instructions.i32.store(0, 0)
    ], "setValue");
    m.function([i32Type], [i64Type], (b) => [
        Instructions.local.get(b.args[0]),
        Instructions.i64.load32_s(0, 0),
    ], "getSignedValue");
    m.function([i32Type], [i64Type], (b) => [
        Instructions.local.get(b.args[0]),
        Instructions.i64.load32_u(0, 0),
    ], "getUnsignedValue");

    const {setValue, getSignedValue, getUnsignedValue} = await m.execute({}) as {
        setValue: (address: number, n: number) => void,
        getSignedValue: (address: number) => bigint,
        getUnsignedValue: (address: number) => bigint
    };

    setValue(0, -9001);
    t.deepEqual(getSignedValue(0), -9001n);
    t.deepEqual(getUnsignedValue(0), 4294958295n);

    setValue(4, -1);
    t.deepEqual(getSignedValue(4), -1n);
    t.deepEqual(getUnsignedValue(4), 4294967295n);

    setValue(8, 80909);
    t.deepEqual(getSignedValue(8), 80909n);
    t.deepEqual(getUnsignedValue(8), 80909n);

    setValue(12, 3000000000);
    t.deepEqual(getSignedValue(12), -1294967296n);
    t.deepEqual(getUnsignedValue(12), 3000000000n);
});
