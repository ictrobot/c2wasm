import fs from "fs";
import {compile, runtime} from "../../src";

const dir = __dirname + "/susan/";

const source = new Map<string, string>();
source.set("susan.c", fs.readFileSync(dir + "susan.c", {encoding: "utf-8"}));

const dataset = new Map<string, Uint8Array>();
fs.readdirSync(dir).filter(x => x.endsWith(".pgm")).forEach(name =>
    dataset.set(name, new Uint8Array(fs.readFileSync(dir + name, {}).buffer)));

const files = new runtime.Files((c) => process.stdout.write(c),undefined, dataset);

compile(source, {
    FILES: "1", // enable file support
}).execute({
    c2wasm: files.getImports()
}).then(module => {
    for (const mode of ["s", "c", "e"]) {
        console.time("mode-" + mode);
        for (let i = 0; i < 100; i++) {
            runtime.mainWrapper(module, ["susan", `input_large.pgm`, `test-${mode}.pgm`, `-${mode}`]);
        }
        console.timeEnd("mode-" + mode);

        fs.writeFileSync(`test-${mode}.pgm`, files.getContents(`test-${mode}.pgm`) as Uint8Array);
    }
});
