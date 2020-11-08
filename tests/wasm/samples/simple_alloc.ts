import test from "ava";
import {ModuleBuilder, i32Type, Instructions} from "../../../src/wasm";

function addAlloc(m: ModuleBuilder) {
    m.setupMemory(1);
    m.dataSegment(0, [0x04, 0x00, 0x00, 0x00]);

    m.function([i32Type, i32Type], [i32Type], b => {
        const size = b.args[0];
        const fillValue = b.args[1];

        const startLocation = b.addLocal(i32Type);
        const endLocation = b.addLocal(i32Type);

        return [
            // load existing memory address
            Instructions.i32.const(0),
            Instructions.i32.load(2, 0),
            Instructions.local.tee(startLocation),
            // end memory address of region
            Instructions.local.get(size),
            Instructions.i32.const(1),
            Instructions.i32.sub(),
            Instructions.i32.add(),
            Instructions.local.set(endLocation),
            // fill existing memory
            Instructions.loop(null, [
                // set fill value
                Instructions.local.get(endLocation),
                Instructions.local.get(fillValue),
                Instructions.i32.store8(0, 0),
                // decrease last value
                Instructions.local.get(endLocation),
                Instructions.i32.const(1),
                Instructions.i32.sub(),
                Instructions.local.tee(endLocation),
                // branch if more filling to do
                Instructions.local.get(startLocation),
                Instructions.i32.ge_u(),
                Instructions.br_if(0)
            ]),
            // update the next free space
            Instructions.i32.const(0),
            Instructions.i32.const(0),
            Instructions.i32.load(2,0),
            Instructions.local.get(size),
            Instructions.i32.add(),
            Instructions.i32.store(2, 0),
            // return the start address
            Instructions.local.get(startLocation)
        ];
    }, "alloc");
}

test("simple allocator", async t => {
    const m = new ModuleBuilder();
    m.function([i32Type], [i32Type], b => [
        Instructions.local.get(b.args[0]),
        Instructions.i32.load8_u(0,0)
    ], "getByte");
    addAlloc(m);

    const {getByte, alloc} = await m.execute({}) as {
        getByte: (address: number) => number,
        alloc: (size: number, fillValue: number) => number
    };

    t.deepEqual(alloc(1, 100), 4);
    t.deepEqual(alloc(10, 65), 5);
    t.deepEqual(alloc(5, 34), 15);

    const expectedBytes = [20,0,0,0,100,65,65,65,65,65,65,65,65,65,65,34,34,34,34,34,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
    const realBytes = expectedBytes.map((_, i) => getByte(i));
    t.deepEqual(expectedBytes, realBytes);
});
