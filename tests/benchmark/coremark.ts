import * as fs from "fs";
import {performance} from "perf_hooks";
import {compile} from "../../src/compile";


const files = new Map<string, string>();
const dir = __dirname + "/coremark/";
for (const filename of fs.readdirSync(dir)) {
    files.set(filename, fs.readFileSync(dir + filename, {encoding: "utf-8"}));
}

function __put_char(n: number): void {
    process.stdout.write(String.fromCharCode(n));
}

function __time(): number {
    return performance.now();
}

async function run() {
    const module = compile(files);
    const bytes = module.toBytes();
    fs.writeFileSync(__dirname + "/coremark.wasm", bytes);

    const {main} = (await WebAssembly.instantiate(bytes, {
        c2wasm: {
            __put_char,
            __time
        }
    })).instance.exports as {main: () => number};

    main();
}

run();
