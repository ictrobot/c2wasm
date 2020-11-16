import {Preprocessor} from "../src/preprocessor";

const testInput = `
int factorial(int v) {
  return v < 2 ? 1 : v * factorial(v - 1);
}
`.trimStart();

function process(input: string): string {
    try {
        const preprocessor = new Preprocessor();
        return preprocessor.process(input);
    } catch (e) {
        console.debug(e);
        return e.stack;
    }
}

if (typeof window !== 'undefined' && window.document) {
    window.document.write(`
        <h1>c2wasm preprocessor</h1>
        <div>
            <textarea id="textInput" rows="20" style="width: 100%; resize: vertical">${testInput}</textarea>
            <pre id="output">${process(testInput)}</pre>
        </div>
    `);

    const textInput = window.document.getElementById("textInput") as HTMLTextAreaElement;
    const output = window.document.getElementById("output") as HTMLPreElement;

    textInput.addEventListener("input", () => {
        output.textContent = process(textInput.value);
    });
} else {
    console.log(process(testInput));
}
