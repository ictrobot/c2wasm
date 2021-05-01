import {setFlags} from "../src";
import {loadBundle} from "../src/c_library/source_bundle";
import {compile} from "../src/";

function writeRow(text: string = "", body: string = "") {
    const div = document.createElement("div");
    if (text) div.innerText = text;
    if (body) div.innerHTML += '\n' + body;
    document.body.appendChild(div);
    document.body.appendChild(document.createElement("hr"));
    return div;
}

document.body.innerHTML = `
    <a href="https://github.com/eembc/coremark" target="_blank" style="float: right"><b>Sources</b></a>
    <h1>CoreMark</h1>
    <hr>
`;

let downloadTime = performance.now();
writeRow("Fetching sources");
fetch("examples/CoreMark.json").then(async response => {
    const text = await response.text();

    downloadTime = performance.now() - downloadTime;
    writeRow("Downloaded sources ", `- ${(text.length / 1024).toFixed(2)} KiB in ${downloadTime.toFixed(2)}ms (${(text.length * 8 / 1024 / 1024 / (downloadTime / 1000)).toFixed(2)} Mb/s)`);

    const sources = loadBundle(JSON.parse(text) as {[s: string]: string});

    // fix source layout
    for (const [filename, contents] of [...sources.entries()]) {
        if (filename.startsWith("c2wasm/")) {
            sources.set(filename.replace("c2wasm/", ""), contents);
            sources.delete(filename);
        } else if (filename.startsWith("simple/")) {
            sources.delete(filename);
        }
    }
    writeRow("Source license:", `<pre>${sources.get("coremark.h")?.match(/\/\*([^\\*]*)\*\//)?.[1]}</pre>`);
    console.log("Sources", sources);

    writeRow("Precompiling standard library");
    setTimeout(() => precompile(sources), 100);
});

async function precompile(sources: Map<string, string>) {
    let compileTime = performance.now();
    try {
        compile("");
    } catch (e) {
        writeRow("Failed ", `<pre>${e.stack}</pre>`);
        return;
    }
    compileTime = performance.now() - compileTime;
    writeRow("Compiled in", `${compileTime.toFixed(2)} ms`);

    writeRow("Compiling module");
    setTimeout(() => compileModule(sources), 100);
}

async function compileModule(sources: Map<string, string>) {
    setFlags("default");
    setFlags({inlining: true});

    let output = "", main: () => number;
    let compileTime = performance.now();
    try {
        main = ((await compile(sources).execute({c2wasm: {
            __put_char: (n: number) => output += String.fromCharCode(n),
            __time: () => performance.now()
        }})) as {main: () => number}).main;
    } catch (e) {
        writeRow("Failed ", `<pre>${e.stack}</pre>`);
        return;
    }
    compileTime = performance.now() - compileTime;
    writeRow("Compiled in", `${compileTime.toFixed(2)} ms`);

    const button = document.createElement("button");
    button.innerText = "Run";
    button.addEventListener("click", () => run(main, () => {
        const out = output;
        output = "";
        return out;
    }));
    writeRow("").appendChild(button);
}

async function run(main: () => number, getOutput: () => string) {
    writeRow("Running CoreMark (will take 10-20 seconds)");
    setTimeout(() => {
        let returnValue: number;
        try {
            returnValue = main();
        } catch (e) {
            writeRow("Failed ", `<pre>${e.stack}</pre>`);
            return;
        }

        writeRow("Output:", `<pre>${getOutput()}</pre>`);
        writeRow("Returned exit code", `<code>${returnValue}</code>`);
    }, 100);
}
