import {setFlags} from "../../src";
import {BenchmarkBase, FLAG_CONFIGURATIONS, OptLevel} from "./base";
import {coremark} from "./coremark";

function shuffleArray<T>(array: T[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

async function run(benchmark: BenchmarkBase, iterations = 10) {
    const runners = getRunners(benchmark);

    for (let i = 0 ; i < iterations; i++) {
        const shuffled = runners.slice();
        shuffleArray(shuffled);

        for (const [_, run, scores] of shuffled) {
            scores.push(benchmark.getScore(await run()));
        }

        console.log(`${benchmark.name.padEnd(32)} - ${i + 1} repeats:`);
        console.log("=".repeat(80));
        for (const [name, _, scores] of runners) {
            // const sorted = scores.slice().sort((a, b) => a - b);

            const min = Math.min(...scores);
            const max = Math.max(...scores);
            const avg = (scores.reduce((a, b) => a + b) / (i + 1));

            // sample stdev
            const stdev = Math.sqrt(scores.map(x => (x - avg) ** 2).reduce((a, b) => a + b) / i);

            console.log(`${name.padEnd(32)} - ${avg.toFixed(2).padEnd(10)} stdev=${stdev.toFixed(2).padEnd(10)} min=${min.toFixed(2).padEnd(10)} max=${max.toFixed(2).padEnd(10)}`);
        }
        console.log("\n");
    }
}

function getRunners(benchmark: BenchmarkBase): [name: string, run: () => Promise<string>, scores: number[]][] {
    const runners: [string, () => Promise<string>, number[]][] = [];

    // c2wasm runners
    for (const [name, flags] of FLAG_CONFIGURATIONS.entries()) {
        runners.push([`LIFTOFF ${name}`, () => {
            setFlags(flags); return benchmark.c2wasmNodeFlagsRun("--liftoff --no-wasm-tier-up");
        }, []]);
    }
    runners.push(["TURBOFAN NONE", () => {
        setFlags("none"); return benchmark.c2wasmNodeFlagsRun("--no-liftoff");
    }, []]);
    runners.push(["TURBOFAN DEFAULT", () => {
        setFlags("default"); return benchmark.c2wasmNodeFlagsRun("--no-liftoff");
    }, []]);

    // emcc runners
    if (benchmark.emccRun !== undefined) {
        const emcc = benchmark.emccRun.bind(benchmark);
        for (const optFlag of ["-O0", "-O1", "-O3", "-Os"] as OptLevel[]) {
            runners.push([`EMCC LIFTOFF ${optFlag}`, () => emcc(optFlag, "--liftoff --no-wasm-tier-up"), []]);
            runners.push([`EMCC TURBOFAN ${optFlag}`, () => emcc(optFlag, "--no-liftoff"), []]);
        }
    }

    // native runner
    if (benchmark.nativeRun !== undefined) {
        const native = benchmark.nativeRun.bind(benchmark);
        runners.push(["NATIVE -O3", () => native("-O3"), []]);
    }

    return runners;
}

if (require.main === module) {
    (async () => {
        await run(coremark);
    })();
}
