import fs from "fs";
import path from "path";
import {performance} from "perf_hooks";
import {BenchmarkBase, OptLevel} from "./base";
import {compile} from "../../src";

const files = (() => {
    const map = new Map<string, string>();
    let dir = path.join(__dirname, "coremark");
    for (const f of ["core_list_join.c", "core_main.c", "coremark.h", "core_matrix.c", "core_state.c", "core_util.c"]) {
        map.set(f, fs.readFileSync(path.join(dir, f), {encoding: "utf8"}));
    }
    dir = path.join(dir, "c2wasm"); // c2wasm platform specific files
    for (const f of ["core_portme.c", "core_portme.h"]) {
        map.set(f, fs.readFileSync(path.join(dir, f), {encoding: "utf8"}));
    }
    return map;
})();
const compilerCmd = `-DCOMPILER_FLAGS=\\"\\" -DPERFORMANCE_RUN=1 -DITERATIONS=0 coremark/*.c coremark/simple/*.c -iquote coremark/ -iquote coremark/simple/`;

export const coremark = (new class extends BenchmarkBase {

    getScore(output: string): number {
        const match = output.match(/Correct operation validated[^]*?CoreMark 1.0 : ([0-9]+\.?[0-9]*)/);
        if (match) {
            return Number(match[1]);
        } else {
            throw new Error("Benchmark failed");
        }
    }

    async c2wasmRun(): Promise<string> {
        const module = compile(files);
        let output = "";

        const {main} = await module.execute({
            c2wasm: {
                __put_char: (n: number) => output += String.fromCharCode(n),
                __time: () => performance.now()
            }
        }) as { main: () => void };
        main();

        return output;
    }

    async emccRun(optimizationLevel: OptLevel, nodeFlags: string): Promise<string> {
        return BenchmarkBase.commandHelper(
            (out) => `emcc ${compilerCmd} ${optimizationLevel} -o ${out}`,
            (out) => `node ${nodeFlags} ${out}`,
            "Failed to run emcc coremark"
        );
    }

    async nativeRun(optimizationLevel: OptLevel): Promise<string> {
        return BenchmarkBase.commandHelper(
            (out) => `gcc ${compilerCmd} ${optimizationLevel} -o ${out}`,
            (out) => `${out}`,
            "Failed to run native coremark"
        );
    }
}("coremark", __filename));

if (require.main === module) {
    BenchmarkBase.setFlags(process.argv[2]);
    (async () => console.log(await coremark.c2wasmRun()))();
}

// console.log(await coremark.emccRun("-O0", "--no-liftoff"));
// console.log(await coremark.emccRun("-O0", "--liftoff --no-wasm-tier-up"));
// console.log(await coremark.emccRun("-O3", "--no-liftoff"));
// console.log(await coremark.emccRun("-O3", "--liftoff --no-wasm-tier-up"));
