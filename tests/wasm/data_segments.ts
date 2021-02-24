import test from "ava";
import {ModuleBuilder, Instructions, i32Type, i64Type} from "../../src/wasm";
import {compile} from "../../src";

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

test("regression - copy data segments", async t => {
    const m = new ModuleBuilder();
    m.setupMemory(1, 1);
    const array = [1,2,3,4,0];
    m.dataSegment(0, array); // strips final 0s from any array - previously didn't always copy
    t.is(array.length, 5); // bug returned 4 here

    // check generation version as well
    let output = "";
    const {main} = await compile(`#include <stdio.h>
    char *a = "hello", *b = "world";
    
    void main() {
       puts(a);
       puts(b);
    }
    `).execute({c2wasm: {__put_char: (x: number) => output += String.fromCharCode(x)}}) as {
        main: () => void
    };

    main();
    t.is(output, "hello\nworld\n");
    // bug would strip \0 before array size is used to increment static pointer, leading to "hello\nworldhello\n"
});
