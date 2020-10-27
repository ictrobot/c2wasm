import {parse} from "../src/parsing/parser";
import {Location} from "../src/parsing/parsetree";
import {validate} from "../src/parsing/validation";

const testInput = `
int factorial(int v) {
  return v < 2 ? 1 : v * factorial(v - 1);
}
`.trimStart();

function parseTree(input: string, showLocations: boolean = false): string {
    try {
        const tree = validate(parse(input));
        return JSON.stringify(tree, (key, value) => {
            if (key.startsWith("_")) return undefined;
            if (key === "loc" && typeof value === "object") {
                if (!showLocations) return undefined;
                const l = value as Location;
                return `${l.first_line + 1}:${l.first_column} → ${l.last_line + 1}:${l.last_column}`;
            }
            return value;
        }, 2);
    } catch (e) {
        console.error(e);
        return e.toString();
    }
}

if (typeof window === 'undefined') {
    console.log(parseTree(testInput));
} else {
    window.document.write(`
        <h1>c2wasm parse tree</h1>
        <div>
            <textarea id="textInput" rows="20" style="width: 100%">${testInput}</textarea>
            <div style="position: absolute; right: 20px">
                <span>Show locations: </span> 
                <input type="checkbox" id="showLoc">
            </div>
            <pre id="output">${parseTree(testInput)}</pre>
        </div>
    `);

    const textInput = window.document.getElementById("textInput") as HTMLTextAreaElement;
    const output = window.document.getElementById("output") as HTMLPreElement;
    const showLoc = window.document.getElementById("showLoc") as HTMLInputElement;

    const handler = () => {
        output.textContent = parseTree(textInput.value, showLoc.checked);
    };
    textInput.addEventListener("input", handler);
    showLoc.addEventListener("change", handler);
}
