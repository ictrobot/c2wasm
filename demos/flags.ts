import {AsyncSeriesWaterfallHook} from "tapable";
import wabt from "wabt";
import {compile, compileSnippet} from "../src/compile";
import {setFlags, getFlags, OptimizationFlags} from "../src/optimization/flags";
import {ModuleBuilder} from "../src/wasm";

const testInput = `
#include <stdio.h>

long factorial(unsigned int v) {
  return v < 2 ? 1 : v * factorial(v - 1);
}

void main() {
  for (int i = 0; i < 21; ++i) {
    printf("%d! is %llu\\n", i, factorial(i));
  }
}
`.trimStart();

// change to test() method for main, add optional setup method
// benchmark button which runs main iterations

wabt().then(wabt => {
    function toWat(module: ModuleBuilder) {
        try {
            const compiled = module.toBytes();

            const wabtModule = wabt.readWasm(compiled, {
                mutable_globals: true,
                sat_float_to_int: true,
                sign_extension: true,
                bulk_memory: true
            });

            const text = wabtModule.toText({
                inlineExport: true
            });

            let validationError = "";
            try {
                wabtModule.validate();
            } catch (e) {
                console.debug(e);
                validationError = e.toString() + "\n\n\n";
            }

            return validationError + text;
        } catch (e) {
            console.debug(e);
            return e.stack;
        }
    }

    let checkboxId = 0;

    class FlagSet {
        containerDiv: HTMLDivElement;

        flagsDiv: HTMLDivElement;
        flagCheckboxes = new Map<keyof OptimizationFlags, HTMLInputElement>();
        flags: OptimizationFlags;

        outputPre: HTMLPreElement;
        compileTimeSpan: HTMLSpanElement;

        module: ModuleBuilder | undefined;

        constructor(flags: "none" | "default") {
            setFlags(flags);
            this.flags = getFlags();

            this.containerDiv = window.document.createElement("div");
            this.containerDiv.classList.add("flagSet");
            window.document.getElementById("main")?.appendChild(this.containerDiv);

            // flags
            this.flagsDiv = window.document.createElement("div");
            this.flagsDiv.classList.add("flags");
            this.containerDiv.appendChild(this.flagsDiv);

            for (const flagName of Object.keys(getFlags())) {
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.value = "true";
                checkbox.id = `checkbox-${++checkboxId}`;
                this.flagsDiv.appendChild(checkbox);

                const label = document.createElement("label");
                label.innerText = flagName;
                label.htmlFor = checkbox.id;
                this.flagsDiv.appendChild(label);
                this.flagsDiv.appendChild(document.createElement("br"));

                checkbox.addEventListener("change", () => this.updateFlags({[flagName]: checkbox.checked}));
                this.flagCheckboxes.set(flagName as keyof OptimizationFlags, checkbox);
            }

            const flagDefaults = document.createElement("button");
            flagDefaults.innerText = "Default";
            flagDefaults.addEventListener("click", () => this.updateFlags("default"));
            this.flagsDiv.appendChild(flagDefaults);

            const flagsNone = document.createElement("button");
            flagsNone.innerText = "None";
            flagsNone.addEventListener("click", () => this.updateFlags("none"));
            this.flagsDiv.appendChild(flagsNone);

            this.flagsDiv.appendChild(document.createElement("br"));
            const deleteButton = document.createElement("button");
            deleteButton.innerText = "Delete row";
            deleteButton.addEventListener("click", () => {
                if (sets.length <= 1) return;
                this.containerDiv.remove();
                sets.splice(sets.indexOf(this), 1);
            });
            this.flagsDiv.appendChild(deleteButton);

            // output
            const outputDiv = window.document.createElement("div");
            outputDiv.classList.add("output");
            this.containerDiv.appendChild(outputDiv);

            this.outputPre = window.document.createElement("pre");
            outputDiv.appendChild(this.outputPre);

            // results
            const resultDiv = window.document.createElement("div");
            resultDiv.classList.add("results");
            resultDiv.classList.add("single");
            this.containerDiv.appendChild(resultDiv);

            function pRow(before: string, after?: string, cssClass?: string): HTMLSpanElement {
                const p = window.document.createElement("p");
                if (cssClass) p.classList.add(cssClass);
                p.appendChild(window.document.createTextNode(before));

                const span = window.document.createElement("span");
                p.appendChild(span);

                if (after) p.appendChild(window.document.createTextNode(after));
                resultDiv.appendChild(p);
                return span;
            }

            this.compileTimeSpan = pRow("Compilation: ", "ms");
            resultDiv.appendChild(window.document.createElement("hr"));

            const avgSpan = pRow("Average: ", "ms");
            const stdSpan = pRow("Std: ", "ms", "multiple");
            const minSpan = pRow("Min: ", "ms", "multiple");
            const maxSpan = pRow("Max: ", "ms", "multiple");
            const iterationsSpan = pRow("", " iterations", "multiple");

            this.results = (results) => {
                iterationsSpan.innerText = results.length.toString();
                if (results.length > 1) {
                    resultDiv.classList.remove("single");
                } else {
                    resultDiv.classList.add("single");
                }

                const avg = (results.reduce((a, b) => a + b) / results.length);
                avgSpan.innerText = avg.toFixed(3);
                // sample stdev
                const stdev = Math.sqrt(results.map(x => (x - avg) ** 2).reduce((a, b) => a + b) / (results.length - 1));
                stdSpan.innerText = stdev.toFixed(3);

                minSpan.innerText = Math.min(...results).toFixed(3);
                maxSpan.innerText = Math.max(...results).toFixed(3);
            };

            this.updateFlags({});
        }

        results: (x: number[]) => void;

        updateFlags(x: Parameters<typeof setFlags>[0]) {
            setFlags(this.flags);
            setFlags(x);
            this.flags = {...getFlags()};

            for (const [flagName, checkbox] of this.flagCheckboxes.entries()) {
                checkbox.checked = this.flags[flagName as keyof OptimizationFlags];
            }
            this.recompile();
        }

        recompile() {
            setFlags(this.flags);
            const s = performance.now();
            try {
                this.module = compile(textInput.value);
            } catch (e) {
                this.outputPre.textContent = e.stack;
                this.module = undefined;
                console.error(e);
                return;
            }
            this.compileTimeSpan.innerText = (performance.now() - s).toFixed(2);

            this.outputPre.textContent = toWat(this.module);

            if (this.module.functions.find(x => x.exportName === "main") === undefined) {
                this.module = undefined;
            }
        }

        private async runModule() {
            if (this.module === undefined) {
                return {output: "No main function", returnValue: undefined, time: NaN};
            }

            let output = "";
            const imports = {c2wasm: {__put_char: (x: number) => output += String.fromCharCode(x)}};
            try {
                const {main} = await this.module.execute(imports) as { main: () => any };

                const start = performance.now();
                const returnValue = main();
                const time = performance.now() - start;

                return {output, returnValue, time};
            } catch (e) {
                console.log(e);
                return {output: e.stack, returnValue: undefined, time: NaN};
            }
        }

        async run() {
            const x = await this.runModule();
            this.outputPre.innerText = x.output;
            if (x.returnValue !== undefined) this.outputPre.textContent += "\nReturn value: " + x.returnValue;
            this.results([x.time]);
        }

        async benchmark(ms = 1000) {
            await this.recompile();

            const start = performance.now();
            const results = [];
            while (results.length < 5 || performance.now() - start < 1000) {
                const {time, output} = await this.runModule();
                if (isNaN(time)) {
                    this.outputPre.innerText = output;
                    return;
                }
                results.push(time);
            }
            results.shift();
            this.results(results);
        }

    }

    window.document.write(`
<h1>c2wasm flags</h1>
<div>
    <div style="position: absolute; right: 2px">
        <button id="benchButton">Benchmark</button>
        <button id="runButton">Run</button>
    </div>
    <textarea id="textInput" rows="20" style="width: 100%; resize: vertical">${testInput}</textarea>
    <pre id="main"></pre>
    <button id="add">Add row</button>
</div>
<style>
.flagSet {
    display: flex;
    flex-flow: row;
    padding-bottom: 4px;
    border-bottom: 2px solid grey;
    margin-bottom: 4px;
}

.flagSet .flags, .flagSet .results {
    max-width: fit-content;
    padding: 0 4px;
    flex: 0;
}

.flagSet .output {
    flex: 1;
    position: relative;
}

.flagSet .output pre {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    top: 0;
    overflow: auto;
    margin: 0;
}

.flagSet .results.single .multiple {
    display: none;
}
</style>
    `);
    // benchmarking
    const benchButton = window.document.getElementById("benchButton") as HTMLButtonElement;
    benchButton.addEventListener("click", async () => {
        for (const set of sets) await set.benchmark();
    });

    // running Wasm
    const runButton = window.document.getElementById("runButton") as HTMLButtonElement;
    runButton.addEventListener("click", async () => {
        for (const set of sets) await set.run();
    });

    // compiling Wasm
    const textInput = window.document.getElementById("textInput") as HTMLTextAreaElement;
    const recompileAll = () => {
        for (const set of sets) set.recompile();
    };
    textInput.addEventListener("input", recompileAll);

    // add set
    const addButton = window.document.getElementById("add") as HTMLButtonElement;
    addButton.addEventListener("click", async () => {
        const newSet = new FlagSet("default");
        sets.push(newSet);
        await newSet.recompile();
    });

    // add some base functions to the window which can then be accessed via dev tools
    (window as any).c2wasm = Object.seal({
        getFlags, setFlags, compile, compileSnippet
    });

    const sets = [new FlagSet("none"), new FlagSet("default")];
});
