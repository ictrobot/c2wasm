import {flag} from "arg";
import {compress, decompress} from "lzutf8";
import wabt from "wabt";
import {compile, compileSnippet} from "../src/compile";
import {setFlags, getFlags} from "../src/optimization/flags";
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

    if (typeof window !== 'undefined' && window.document) {
        window.document.write(`
        <h1>c2wasm</h1>
        <div>
            <textarea id="textInput" rows="20" style="width: 100%; resize: vertical">${testInput}</textarea>
            <div style="position: absolute; right: 2px">
                <button id="flagsButton">Flags</button>
                <button id="copyButton">Copy URL</button>
                <button id="runButton">Run!</button>
            </div>
            <div id="flags" style="display: none"></div>
            <pre id="output"></pre>
        </div>
    `);
        let module: ModuleBuilder | undefined;

        const textInput = window.document.getElementById("textInput") as HTMLTextAreaElement;
        const output = window.document.getElementById("output") as HTMLPreElement;

        // running Wasm
        const runButton = window.document.getElementById("runButton") as HTMLButtonElement;
        runButton.addEventListener("click", async () => {
            if (module === undefined) return;
            output.textContent = "Output:\n\n";

            const imports: {c2wasm: {[s: string]: typeof console.log}} = {c2wasm: {}};
            module.functionImports.filter(x => x.type[1].length === 0).forEach(f => {
                if (f.name === "__put_char") {
                    imports.c2wasm[f.name] = (char: number) => {
                        output.textContent += String.fromCharCode(char);
                    };
                } else {
                    imports.c2wasm[f.name] = (...args: any[]) => {
                        console.log(...args);
                        output.textContent += args.join(" ") + "\n";
                    };
                }
            });

            try {
                const {main, __mem} = await module.execute(imports) as { main: () => any, __mem?: WebAssembly.Memory };
                (window as any).wMem = __mem;
                const returnValue = main();
                if (returnValue !== undefined) output.textContent += "\nReturn value: " + returnValue;
            } catch (e) {
                console.log(e);
                output.textContent = e.stack;
            }
        });

        // compiling Wasm
        const recompile = () => {
            const files = new Map<string, string>();
            files.set("main.c", textInput.value);

            try {
                module = compile(files);
            } catch (e) {
                output.textContent = e.stack;
                module = undefined;
                throw e;
            }

            output.textContent = toWat(module);

            if (module.functions.find(x => x.exportName === "main") === undefined) {
                runButton.disabled = true;
                module = undefined;
            } else {
                runButton.disabled = false;
            }
        };
        textInput.addEventListener("input", recompile);

        // Optimization flags
        const flagsButton = window.document.getElementById("flagsButton") as HTMLButtonElement;
        flagsButton.addEventListener("click", () => flagsDiv.style.display = flagsDiv.style.display === "none" ? "" : "none");

        const flagsDiv = window.document.getElementById("flags") as HTMLDivElement;
        const updateCheckboxes = () => {
            const flags = getFlags();
            for (const [flagName, checkbox] of Object.entries(flagCheckboxes)) {
                checkbox.checked = flags[flagName as keyof typeof flags];
            }
        };

        const flagCheckboxes = Object.fromEntries(Object.keys(getFlags()).map(flagName => {
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = "true";
            checkbox.id = flagName;
            flagsDiv.appendChild(checkbox);
            const label = document.createElement("label");
            label.innerText = label.htmlFor = flagName;
            flagsDiv.appendChild(label);
            flagsDiv.appendChild(document.createElement("br"));

            checkbox.addEventListener("change", () => {
                setFlags({[flagName]: checkbox.checked});
                updateCheckboxes();
                recompile();
            });

            return [flagName, checkbox];
        }));
        updateCheckboxes();

        const flagDefaults = document.createElement("button");
        flagDefaults.innerText = "Default Flags";
        flagDefaults.addEventListener("click", () => {
            setFlags("default");
            updateCheckboxes();
            recompile();
        });
        flagsDiv.appendChild(flagDefaults);

        const flagsNone = document.createElement("button");
        flagsNone.innerText = "None";
        flagsNone.addEventListener("click", () => {
            setFlags("none");
            updateCheckboxes();
            recompile();
        });
        flagsDiv.appendChild(flagsNone);
        flagsDiv.appendChild(document.createElement("hr"));

        // URL copying
        if (window.location.hash.length) {
            const hash = window.location.hash.substring(1);
            textInput.value = decompress(hash, {inputEncoding: "Base64", outputEncoding: "String"});
        }

        const copyURLButton = window.document.getElementById("copyButton") as HTMLButtonElement;
        copyURLButton.addEventListener("click", async () => {
            const baseURL = window.location.href.split("#")[0];
            const base64 = compress(textInput.value, {outputEncoding: "Base64"});
            await navigator.clipboard.writeText(baseURL + "#" + base64);
        });

        // add some base functions to the window which can then be accessed via dev tools
        (window as any).c2wasm = Object.seal({
            getFlags, setFlags, compile, compileSnippet
        });

        recompile();
    } else {
        const files = new Map<string, string>();
        files.set("main.c", testInput);
        console.log(toWat(compile(files)));
    }

});
