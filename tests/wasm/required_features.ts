import test from "ava";
import * as features from "wasm-feature-detect";

test("required wasm features present", async t => {
    t.is(await features.bigInt(), true, "Expected environment to support BigInt integration");
    t.is(await features.bulkMemory(), true, "Expected environment to support bulk memory operations");
    t.is(await features.mutableGlobals(), true, "Expected environment to support mutable globals");
    t.is(await features.saturatedFloatToInt(), true, "Expected environment to support saturated float to int instructions");
    t.is(await features.signExtensions(), true, "Expected environment to support sign extension instructions");
});
