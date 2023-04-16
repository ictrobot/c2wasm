import {Network, Node, Edge, Options} from "vis-network";
import {compileSnippet} from "../src/compile";
import {controlFlow, Flow} from "../src/optimisation/flow/control_flow";
import {ModuleBuilder, WFunction} from "../src/wasm";

if (typeof window === 'undefined' || !window.document) throw new Error("Must be ran in a web browser");

const testInput = `
long testFn(int v) {
  if (v < 0) return -1;
  if (v > 100) return 0;
  v *= 2;

  int sum = 0;
  for (int i = 0; i < v; i++) {
    sum += i;
  }
  return sum;
}

`.trimStart();

let network: Network | undefined = undefined;
const networkOptions: Options = {
    nodes: {
        shape: "dot",
        size: 8,
        color: "gray"
    },
    edges: {
        color: "gray",
        arrows: "to"
    },
    layout: {
        randomSeed: 1
    }
};

function draw(fn: WFunction) {
    const {all, entry, exit} = controlFlow(fn.body);
    const nodes: Node[] = [
        {id: 0, label: "Start", color: "green", borderWidth: 3},
        {id: 1, label: "End", color: "red", borderWidth: 3},
    ];
    const edges: Edge[] = [];
    const nodeMap = new Map<Flow, number>();
    nodeMap.set(exit, 1);

    for (let i = 0; i < all.length;) {
        let j = i;
        for (; j < all.length; j++) {
            if (all[j].flowNext.length !== 1) break;
            const [next] = [...all[j].flowNext];
            if (next !== all[j + 1] || next.flowPrevious.length > 1) break;
        }

        const names: string[] = [];
        for (; i <= Math.min(j, all.length - 1); i++) {
            names.push(all[i].instr.name);
            nodeMap.set(all[i], nodes.length);
        }

        nodes.push({
            id: nodes.length,
            label: names.join("\n")
        });
    }

    for (const entries of entry.flowNext) {
        const node = nodeMap.get(entries);
        if (node) edges.push({from: 0, to: node});
    }

    for (const flow1 of all) {
        const from = nodeMap.get(flow1) ?? -1;
        for (const flow2 of flow1.flowNext) {
            const to = nodeMap.get(flow2) ?? -1;
            if (from !== to) edges.push({from, to});
        }
    }

    const data = {
        nodes: nodes,
        edges: edges,
    };

    if (network) {
        network.setData(data);
    } else {
        network = new Network(container, data, networkOptions);
    }
}

window.document.write(`
<style>
html, body {
    height: 100%;
}

* {
    margin: 0;
    box-sizing: border-box;
}
</style>

<div style="display: flex; flex-direction: column; width: 100%; height: 100%">
    <h1 style="margin: 4px;">c2wasm cfg</h1>
    <textarea id="textInput" rows="20" style="width: 100%; resize: vertical">${testInput}</textarea>
    <pre id="errors"></pre>
    <div style="flex: 1; position: relative">
        <div style="position:absolute; width: 100%; height: 100%;" id="network"></div>
    </div>
</div>`);
let module: ModuleBuilder | undefined;

const textInput = window.document.getElementById("textInput") as HTMLTextAreaElement;
const errors = window.document.getElementById("errors") as HTMLPreElement;
const container = document.getElementById("network") as HTMLDivElement;

const recompile = () => {
    try {
        module = compileSnippet(textInput.value);
        errors.innerText = "";
        container.style.visibility = "visible";
    } catch (e) {
        module = undefined;
        errors.innerText = e.stack;
        container.style.visibility = "hidden";
        throw e;
    }

    const fn = module.functions.find(x => x.exportName);
    if (fn) draw(fn);
};
textInput.addEventListener("input", recompile);

recompile();
