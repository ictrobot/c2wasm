import test from "ava";
import fs from "fs";
import path from "path";
import type {BenchmarkBase} from "./benchmark/base";

// Check the benchmarks run successfully
// As the benchmarks expect to be run in the tests folder (and not compiled and ran from build/), we use
// ts-node/register and manually important them from the benchmark directory

// find project directory
const benchmarkDir = (() => {
    let projectDir = __dirname;
    while (!fs.existsSync(path.join(projectDir, "package.json"))) {
        const newDir = path.join(projectDir, "..");
        if (newDir !== projectDir) {
            projectDir = newDir;
        } else {
            throw new Error("Couldn't find project root dir");
        }
    }
    return path.join(projectDir, "tests", "benchmark");
})();

/* eslint-disable @typescript-eslint/no-var-requires */
require('ts-node').register({});
const coremark = require(path.join(benchmarkDir, "coremark")).coremark as BenchmarkBase;
const jpegTests = require(path.join(benchmarkDir, "jpeg")).jpegTests as () => Promise<void>;

test("coremark", async t => {
    const output = await coremark.c2wasmRun();
    t.log(output);
    t.truthy(coremark.getScore(output));
});

test("jpeg tests", async t => {
    await t.notThrowsAsync(jpegTests);
});
