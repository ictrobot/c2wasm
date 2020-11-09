import {compile} from "../src/generation";
import wabt from "wabt";

const testInput = `
long factorial(unsigned int v) {
  return v < 2 ? 1 : v * factorial(v - 1);
}
`.trimStart();

wabt().then(wabt => {
    function cToWat(input: string): string {
        try {
            const module = compile(input);
            const compiled = module.toBytes();
            return wabt.readWasm(compiled, {

            }).toText({
                inlineExport: true
            });
        } catch (e) {
            console.debug(e);
            return e.stack;
        }
    }

    if (typeof window !== 'undefined' && window.document) {
        window.document.write(`
        <h1>c2wasm</h1>
        <div>
            <textarea id="textInput" rows="20" style="width: 100%">${testInput}</textarea>
            <pre id="output">${cToWat(testInput)}</pre>
        </div>
    `);

        const textInput = window.document.getElementById("textInput") as HTMLTextAreaElement;
        const output = window.document.getElementById("output") as HTMLPreElement;

        const handler = () => {
            output.textContent = cToWat(textInput.value);
        };
        textInput.addEventListener("input", handler);
    } else {
        console.log(cToWat(testInput));
    }

});
