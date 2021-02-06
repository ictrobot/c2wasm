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

    async c2wasmSize(): Promise<number> {
        return compile(files).toBytes().length;
    }

    async emccCompile(optLevel: OptLevel): Promise<void> {
        await BenchmarkBase.cmdStdout(`emcc ${compilerCmd} ${optLevel} -o /tmp/c2wasm-coremark-emcc${optLevel}`);
    }

    async emccRun(optLevel: OptLevel, nodeFlags: string): Promise<string> {
        return BenchmarkBase.cmdStdout(`node ${nodeFlags} /tmp/c2wasm-coremark-emcc${optLevel}`);
    }

    async emccSize(optLevel: OptLevel): Promise<number> {
        return Number(await BenchmarkBase.cmdStdout(`stat -c %s /tmp/c2wasm-coremark-emcc${optLevel}`));
    }

    async nativeCompile(optLevel: OptLevel): Promise<void> {
        await BenchmarkBase.cmdStdout(`gcc ${compilerCmd} ${optLevel} -o /tmp/c2wasm-coremark-native${optLevel}`);
    }

    async nativeRun(optLevel: OptLevel): Promise<string> {
        return BenchmarkBase.cmdStdout(`/tmp/c2wasm-coremark-native${optLevel}`);
    }
}("coremark", __filename));

if (require.main === module) {
    BenchmarkBase.setFlags(process.argv[2]);
    (async () => console.log(await coremark.c2wasmRun()))();
}
