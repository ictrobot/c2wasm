import {exec} from "child_process";
import * as fs from "fs";
import {performance} from "perf_hooks";
import {compile} from "../../src/compile";
import {setFlags} from "../../src/optimisation/flags";

const dir = __dirname + "/benchmarksgame/";

function __put_char(n: number): void {
    //process.stdout.write(String.fromCharCode(n));
}

async function test(filename: string) {
    const path = dir + filename;
    const source = fs.readFileSync(path, "utf8");

    // wasm time
    const {main: mainOpt} = await compile(source).execute({c2wasm: {__put_char}}) as {main: () => void};
    const start = performance.now();
    mainOpt();
    const wasmTime = (performance.now() - start) / 1000;
    process.stdout.write(`\n# ${filename.padEnd(20)} Wasm: ${wasmTime.toFixed(2)} `);

    // native time
    const nativeCmd = `/bin/bash -c "OUTPUT_FILE=\\$(mktemp); gcc -O3 ./benchmarksgame/${filename} -lm -o \\$OUTPUT_FILE; TIMEFORMAT=%R; time \\$OUTPUT_FILE > /dev/null; rm \\$OUTPUT_FILE;"`;
    const stderr: string = await new Promise(resolve => exec(
        process.platform.startsWith("win") ? "wsl -- " + nativeCmd : nativeCmd,
        {cwd: __dirname},
        (error, stdout, stderr) => {
            if (error) {
                console.log(error);
                console.error("Requires gcc and bash (and WSL on windows)!");
                process.exit();
            }
            resolve(stderr.trim());
        }));

    const nativeTime = Number(stderr.trim());
    console.log(`Native: ${nativeTime.toFixed(2)} Mul: ${(wasmTime / nativeTime).toFixed(2)}\n`);
}

async function main() {
    console.log("NOTE: there are more optimised versions of these programs using multithreading, specific compiler optimisations or architecture specific instructions which are faster natively.\n");

    for (const filename of fs.readdirSync(dir).reverse()) {
        if (filename.endsWith(".c")) await test(filename);
    }
}

main();
