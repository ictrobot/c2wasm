import {compress, decompress} from "lzutf8";
import {compile} from "../src/generation";
import wabt from "wabt";
import {ModuleBuilder} from "../src/wasm";

const testInput = `
extern void print(int a, long b);

long factorial(unsigned int v) {
  return v < 2 ? 1 : v * factorial(v - 1);
}

void main() {
  for (int i = 0; i < 21; ++i) {
    print(i, factorial(i));
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
                <button id="copy">Copy URL</button>
                <button id="run">Run!</button>
            </div>
            <pre id="output"></pre>
        </div>
    `);
        let module: ModuleBuilder | undefined;

        const textInput = window.document.getElementById("textInput") as HTMLTextAreaElement;
        const output = window.document.getElementById("output") as HTMLPreElement;
        const run = window.document.getElementById("run") as HTMLButtonElement;
        const copyURL = window.document.getElementById("copy") as HTMLButtonElement;

        run.addEventListener("click", async () => {
            if (module === undefined) return;
            output.textContent = "Output:\n\n";

            const imports: {extern: {[s: string]: typeof console.log}} = {extern: {}};
            module.functionImports.filter(x => x.type[1].length === 0).forEach(f => {
                imports.extern[f.name] = (...args: any[]) => {
                    console.log(...args);
                    output.textContent += args.join(" ") + "\n";
                };
            });

            try {
                const {main} = await module.execute(imports) as { main: () => any };
                const returnValue = main();
                if (returnValue !== undefined) output.textContent += "\nReturn value: " + returnValue;
            } catch (e) {
                console.log(e);
                output.textContent = e.stack;
            }
        });

        if (window.location.hash.length) {
            const hash = window.location.hash.substring(1);
            textInput.value = decompress(hash, {inputEncoding: "Base64", outputEncoding: "String"});
        }

        const handler = () => {
            try {
                module = compile(textInput.value);
            } catch (e) {
                output.textContent = e.stack;
                module = undefined;
                throw e;
            }

            output.textContent = toWat(module);

            if (module.functions.find(x => x.exportName === "main") === undefined) {
                run.disabled = true;
                module = undefined;
            } else {
                run.disabled = false;
            }
        };
        textInput.addEventListener("input", handler);
        handler();

        copyURL.addEventListener("click", async () => {
            const baseURL = window.location.href.split("#")[0];
            const base64 = compress(textInput.value, {outputEncoding: "Base64"});
            await navigator.clipboard.writeText(baseURL + "#" + base64);
        });
    } else {
        console.log(toWat(compile(testInput)));
    }

});
