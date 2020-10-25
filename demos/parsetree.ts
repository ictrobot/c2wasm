import {parse} from "../src/parsing/parser";

const testInput = `
int factorial(int v) {
  return v < 2 ? 1 : v * factorial(v - 1);
}
`.trimStart();

function parseTree(input: string): string {
    try {
        return JSON.stringify(parse(input), (key, value) => {
            return key.startsWith("_") || key === "loc" ? undefined : value;
        }, 2);
    } catch (e) {
        return e.toString();
    }
}

if (typeof window === 'undefined') {
    console.log(parseTree(testInput));
} else {
    window.document.write(`
        <h2>Parse Tree</h2>
        <div>
            <textarea id="textInput" rows="40" style="width: 100%">${testInput}</textarea>
            <pre id="output">${parseTree(testInput)}</pre>
        </div>
    `);

    const textInput = window.document.getElementById("textInput") as HTMLTextAreaElement;
    const output = window.document.getElementById("output") as HTMLPreElement;

    const handler = () => {
        output.textContent = parseTree(textInput.value);
    };
    textInput.addEventListener("input", handler);
}
