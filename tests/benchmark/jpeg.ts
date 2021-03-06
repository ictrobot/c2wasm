import * as fs from "fs";
import {compile, runtime} from "../../src";
import {performance} from "perf_hooks";
import {BenchmarkBase, OptLevel} from "./base";

// source files
const SRC_DIR = __dirname + "/jpeg/src/";
const LIBJPEG = ["jcapimin.c", "jcapistd.c", "jctrans.c", "jcparam.c", "jdatadst.c", "jcinit.c", "jcmaster.c", "jcmarker.c", "jcmainct.c", "jcprepct.c", "jccoefct.c", "jccolor.c", "jcsample.c", "jchuff.c", "jcphuff.c", "jcdctmgr.c", "jfdctfst.c", "jfdctflt.c", "jfdctint.c", "jdapimin.c", "jdapistd.c", "jdtrans.c", "jdatasrc.c", "jdmaster.c", "jdinput.c", "jdmarker.c", "jdhuff.c", "jdphuff.c", "jdmainct.c", "jdcoefct.c", "jdpostct.c", "jddctmgr.c", "jidctfst.c", "jidctflt.c", "jidctint.c", "jidctred.c", "jdsample.c", "jdcolor.c", "jquant1.c", "jquant2.c", "jdmerge.c", "jcomapi.c", "jutils.c", "jerror.c", "jmemmgr.c", "jmemnobs.c"];
const CDJPEG = [...LIBJPEG, "rdppm.c", "rdgif.c", "rdtarga.c", "rdrle.c", "rdbmp.c", "rdswitch.c", "wrppm.c", "wrgif.c", "wrtarga.c", "wrrle.c", "wrbmp.c", "rdcolmap.c", "cdjpeg.c"];

// data files to check correctness
const DATASET = new Map<string, Uint8Array>();
fs.readdirSync(SRC_DIR).filter(x => x.startsWith("test")).forEach(name =>
    DATASET.set(name, fs.readFileSync(SRC_DIR + name, {})));
// file used for benchmarking
DATASET.set("benchmark.bmp", fs.readFileSync(`${__dirname}/jpeg/benchmark.bmp`, {}));

function jpegCompile(name: "cjpeg" | "djpeg"): Promise<WebAssembly.Module> {
    const source = new Map<string, string>();
    fs.readdirSync(SRC_DIR).filter(x => x.endsWith(".h") || x === `${name}.c` || CDJPEG.includes(x)).forEach(name =>
        source.set(name, fs.readFileSync(SRC_DIR + name, {encoding: "utf-8"})));

    const bytes = compile(source, {FILES: "1"}).toBytes();
    fs.writeFileSync(`${__dirname}/${name}.wasm`, bytes);
    return WebAssembly.compile(bytes);
}

// correctness testing
function u8Equal(u8arr1: Uint8Array, u8arr2: Uint8Array) {
    if (u8arr1.byteLength !== u8arr2.byteLength) return false;
    for (let i = 0 ; i < u8arr1.byteLength ; i++) {
        if (u8arr1[i] !== u8arr2[i]) return false;
    }
    return true;
}

async function jpegTest(m: WebAssembly.Module, cmdline: string[], outputFile: string, compareAgainst?: string): Promise<string> {
    let output = "";
    const files = new runtime.Files((c) => output += c, undefined, DATASET);
    const module = await WebAssembly.instantiate(m, {c2wasm: {
        ...files.getImports(),
        __time: () => performance.now()
    }});

    let err = undefined;
    try {
        runtime.mainWrapper(module.exports, cmdline);
    } catch (e) {
        err = e;
    }

    const contents = files.getContents(outputFile);
    if (!contents) throw err ?? new Error("Failed test");
    // fs.writeFileSync(outputFile, contents);

    if (compareAgainst) {
        const targetContents = files.getContents(compareAgainst);
        if (!targetContents) throw new Error("Couldn't find target file");
        if (!u8Equal(contents, targetContents)) throw new Error("Failed test - output does not match target");
    }

    return output;
}

export async function jpegTests(): Promise<void> {
    const cjpeg = await jpegCompile("cjpeg");
    const djpeg = await jpegCompile("djpeg");

    await jpegTest(djpeg, ["djpeg", "testorig.jpg", "outimg.ppm"], "outimg.ppm", "testimg.ppm");
    await jpegTest(djpeg, ["djpeg", "-bmp", "-colours", "256", "testorig.jpg", "outimg.bmp"], "outimg.bmp", "testimg.bmp");
    await jpegTest(cjpeg, ["cjpeg", "testimg.ppm", "outimg.jpg"], "outimg.jpg");
}

// benchmark
const cjpegCompilerFiles = ["cjpeg.c", ...CDJPEG].map(f => `jpeg/src/${f}`).join(" ");
export const cjpeg = (new class extends BenchmarkBase {
    getScore(output: string): number {
        const match = output.match(/^([0-9]+\.[0-9]+)\r?\n?$/);
        if (match) {
            return Number(match[1]);
        } else {
            console.log(output);
            throw new Error("Benchmark failed");
        }
    }

    async c2wasmRun(): Promise<string> {
        const cjpeg = await jpegCompile("cjpeg");
        return await jpegTest(cjpeg, ["cjpeg", "benchmark.bmp", "output.jpg"], "output.jpg");
    }

    async c2wasmSize(): Promise<number> {
        await jpegCompile("cjpeg");
        return (await fs.promises.stat(`${__dirname}/cjpeg.wasm`)).size;
    }

    async emccCompile(optLevel: OptLevel): Promise<void> {
        await BenchmarkBase.cmdStdout(`emcc -w ${cjpegCompilerFiles} -s EXIT_RUNTIME=1 -s NODERAWFS=1 ${optLevel} -o /tmp/c2wasm-cjpeg-emcc${optLevel}; cp jpeg/benchmark.bmp /tmp/c2wasm-cjpeg-benchmark.bmp`);
    }

    async emccRun(optLevel: OptLevel, nodeFlags: string): Promise<string> {
        return BenchmarkBase.cmdStdout(`node ${nodeFlags} /tmp/c2wasm-cjpeg-emcc${optLevel} /tmp/c2wasm-cjpeg-benchmark.bmp /dev/null`);
    }

    async emccSize(optLevel: OptLevel): Promise<number> {
        return Number(await BenchmarkBase.cmdStdout(`stat -c %s /tmp/c2wasm-cjpeg-emcc${optLevel}.wasm`));
    }

    async nativeCompile(optLevel: OptLevel): Promise<void> {
        await BenchmarkBase.cmdStdout(`gcc -w ${cjpegCompilerFiles} ${optLevel} -o /tmp/c2wasm-cjpeg-native${optLevel}; cp jpeg/benchmark.bmp /tmp/c2wasm-cjpeg-benchmark.bmp`);
    }

    async nativeRun(optLevel: OptLevel): Promise<string> {
        return BenchmarkBase.cmdStdout(`/tmp/c2wasm-cjpeg-native${optLevel} /tmp/c2wasm-cjpeg-benchmark.bmp /dev/null`);
    }
}("cjpeg", __filename));

if (require.main === module) {
    BenchmarkBase.setFlags(process.argv[2]);
    (async () => console.log(await cjpeg.c2wasmRun()))();
}
