import * as fs from "fs";
import {performance} from "perf_hooks";
import {BenchmarkBase} from "./base";

const SOURCE = `
static long f(long x) {
  long y;
  if (x % 10 == 0) {
    y = x * x * x;
  } else {
    y = 1L << (x % 10);
  }
  y ^= x;
  return y / (x * x * x);
}

int main() {
  int result = 0;
  for (int i = 10; i <= 1000 * 1000; i++) result += f(i);
  return result;
}
`;
const CORRECT_RESULT = 50432;

// benchmark
export const toy = (new class extends BenchmarkBase {
    getScore(output: string): number {
        return Number(output);
    }

    async c2wasmRun(): Promise<string> {
        // compileSnippet to avoid overhead of compiling (unused) std lib
        const module = fs.readFileSync(this.fileName);
        const {main} = (await WebAssembly.instantiate(module)).instance.exports as {main: () => number};

        const start = performance.now();
        const result = main();
        const end = performance.now();

        if (result !== CORRECT_RESULT) throw new Error("Incorrect result");
        return String(end - start);
    }

    async c2wasmSize(): Promise<number> {
        const module = (await import("../../src")).compileSnippet(SOURCE).toBytes();

        fs.writeFileSync(this.fileName, module);
        return (await fs.promises.stat(this.fileName)).size;
    }

    get fileName(): string {
        return `/tmp/c2wasm-toy-${BenchmarkBase.flagString()}.wasm`;
    }

    emccCompile = undefined;
    emccRun = undefined;
    emccSize = undefined;
    nativeCompile = undefined;
    nativeRun = undefined;
}("toy benchmark", __filename, true));

if (require.main === module) {
    BenchmarkBase.setFlags(process.argv[2]);
    (async () => console.log(await toy.c2wasmRun()))();
}
