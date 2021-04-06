import {setFlags} from "../../src";
import {BenchmarkBase, FLAG_CONFIGURATIONS, OptLevel} from "./base";
import {coremark} from "./coremark";
import {cjpeg} from "./jpeg";
import {raytracer} from "./raytracer";

function shuffleArray<T>(array: T[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

async function run(benchmark: BenchmarkBase, iterations = 10) {
    const runners = await getRunners(benchmark);

    for (let i = 0 ; i < iterations; i++) {
        const shuffled = runners.slice();
        shuffleArray(shuffled);

        for (const [name, run, scores] of shuffled) {
            try {
                scores.push(benchmark.getScore(await run()));
            } catch (e) {
                throw new Error("Failed to run benchmark (" + name + ")\n\n" + e.stack);
            }
        }

        console.log(`${benchmark.name.padEnd(32)} - ${i + 1} repeats:`);
        console.log("=".repeat(120));
        for (const [name, _, scores] of runners) {
            // const sorted = scores.slice().sort((a, b) => a - b);

            const min = Math.min(...scores);
            const max = Math.max(...scores);
            const avg = (scores.reduce((a, b) => a + b) / (i + 1));

            // sample stdev
            const stdev = Math.sqrt(scores.map(x => (x - avg) ** 2).reduce((a, b) => a + b) / i);

            console.log(`${name.padEnd(32)} - ${avg.toFixed(3).padEnd(10)} stdev=${stdev.toFixed(3).padEnd(10)} min=${min.toFixed(3).padEnd(10)} max=${max.toFixed(3).padEnd(10)}`);
        }
        console.log("\n");
    }
}

async function getRunners(benchmark: BenchmarkBase): Promise<[name: string, run: () => Promise<string>, scores: number[]][]> {
    const runners: [string, () => Promise<string>, number[]][] = [];
    const sizes = new Map<string, number>();

    // c2wasm runners
    for (const [name, flags] of FLAG_CONFIGURATIONS.entries()) {
        runners.push([`LIFTOFF ${name}`, () => {
            setFlags(flags); return benchmark.c2wasmNodeFlagsRun("--liftoff --no-wasm-tier-up");
        }, []]);

        // get size of module
        setFlags(flags);
        sizes.set(name, await benchmark.c2wasmSize());
    }
    runners.push(["TURBOFAN NONE", () => {
        setFlags("none"); return benchmark.c2wasmNodeFlagsRun("--no-liftoff");
    }, []]);
    runners.push(["TURBOFAN DEFAULT", () => {
        setFlags("default"); return benchmark.c2wasmNodeFlagsRun("--no-liftoff");
    }, []]);

    const compilePromises: Promise<void>[] = [];

    // emcc runners
    if (benchmark.emccRun && benchmark.emccCompile && benchmark.emccSize) {
        const emcc = benchmark.emccRun.bind(benchmark), size = benchmark.emccSize.bind(benchmark);
        for (const optFlag of ["-O0", "-O1", "-O2", "-O3", "-Os"] as OptLevel[]) {
            runners.push([`EMCC LIFTOFF ${optFlag}`, () => emcc(optFlag, "--liftoff --no-wasm-tier-up"), []]);
            runners.push([`EMCC TURBOFAN ${optFlag}`, () => emcc(optFlag, "--no-liftoff"), []]);

            compilePromises.push(benchmark.emccCompile(optFlag).then(async () => {
                sizes.set(`EMCC ${optFlag}`, await size(optFlag));
            }));
        }
    }

    // native runner
    if (benchmark.nativeRun && benchmark.nativeCompile) {
        const native = benchmark.nativeRun.bind(benchmark);
        for (const optFlag of ["-O1", "-O2", "-O3"] as OptLevel[]) {
            runners.push(["NATIVE " + optFlag, () => native(optFlag), []]);
            compilePromises.push(benchmark.nativeCompile(optFlag));
        }
    }

    await Promise.all(compilePromises);

    // print WASM module sizes
    console.log(`${benchmark.name.padEnd(32)} - Wasm module sizes (KiB)`);
    for (const [name, size] of sizes) {
        console.log(`${name.padEnd(32)} - ${(size / 1024).toFixed(2)}`);
    }
    console.log("\n");

    return runners;
}

if (require.main === module) {
    const benchmarks = {cjpeg, coremark, raytracer} as {[k: string]: BenchmarkBase};
    const requested = process.argv[2]?.toLowerCase();

    let benchmark;
    if (requested && benchmarks[requested]) {
        benchmark = benchmarks[requested];
    } else if (requested) {
        throw new Error("Unknown benchmark '" + requested + "'");
    } else {
        console.log("No benchmark name provided, defaulting to CoreMark");
        benchmark = coremark;
    }

    (async () => {
        await run(raytracer);
    })();
}
