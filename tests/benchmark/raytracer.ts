import * as fs from "fs";
import {compile} from "../../src";
import {performance} from "perf_hooks";
import {Files} from "../../src/c_library/runtime/files";
import {BenchmarkBase, OptLevel} from "./base";

const SRC_DIR = __dirname + "/raytracer/src/";
const SRC_MAP = new Map<string, string>();
fs.readdirSync(SRC_DIR).forEach(name =>
    SRC_MAP.set(name, fs.readFileSync(SRC_DIR + name, {encoding: "utf8"})));

function compileModule(): Promise<WebAssembly.Module> {
    const bytes = compile(SRC_MAP, {FILES: "1"}).toBytes();
    fs.writeFileSync(`${__dirname}/raytracer.wasm`, bytes);
    return WebAssembly.compile(bytes);
}

async function run(): Promise<[string, Uint8Array]> {
    let output = "";
    const files = new Files((c) => output += c, undefined);

    const {main} = (await WebAssembly.instantiate(await compileModule(), {c2wasm: {
        __time: () => performance.now(),
        ...files.getImports()
    }})).exports as { main: () => void};
    main();

    if (!output.includes("Rendered scene in ")) throw new Error("Failed test");

    const contents = files.getContents("render.ppm");
    if (!contents) throw new Error("Failed test - no output file");
    fs.writeFileSync("render.ppm", contents);

    return [output, contents];
}

// benchmark
export const raytracer = (new class extends BenchmarkBase {
    getScore(output: string): number {
        const match = output.match(/Rendered scene in ([1-9][0-9]*\.[0-9]+) seconds/);
        if (match) {
            return Number(match[1]);
        } else {
            throw new Error("Benchmark failed");
        }
    }

    async c2wasmRun(): Promise<string> {
        const [output] = await run();
        return output;
    }

    async c2wasmSize(): Promise<number> {
        await compileModule();
        return (await fs.promises.stat(`${__dirname}/raytracer.wasm`)).size;
    }

    async emccCompile(optLevel: OptLevel): Promise<void> {
        await BenchmarkBase.cmdStdout(`emcc -w raytracer/src/*.c -s ALLOW_MEMORY_GROWTH=1 -s NODERAWFS=1 ${optLevel} -o /tmp/c2wasm-ray-emcc${optLevel}`);
    }

    async emccRun(optLevel: OptLevel, nodeFlags: string): Promise<string> {
        return BenchmarkBase.cmdStdout(`node ${nodeFlags} /tmp/c2wasm-ray-emcc${optLevel}`);
    }

    async emccSize(optLevel: OptLevel): Promise<number> {
        return Number(await BenchmarkBase.cmdStdout(`stat -c %s /tmp/c2wasm-ray-emcc${optLevel}.wasm`));
    }

    async nativeCompile(optLevel: OptLevel): Promise<void> {
        await BenchmarkBase.cmdStdout(`gcc -lm -w raytracer/src/*.c ${optLevel} -o /tmp/c2wasm-ray-native${optLevel}`);
    }

    async nativeRun(optLevel: OptLevel): Promise<string> {
        return BenchmarkBase.cmdStdout(`/tmp/c2wasm-ray-native${optLevel}`);
    }
}("raytracer", __filename));

if (require.main === module) {
    BenchmarkBase.setFlags(process.argv[2]);
    (async () => console.log(await raytracer.c2wasmRun()))();
}
