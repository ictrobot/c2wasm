import {toIR} from "../src/tree";
import {CArithmetic} from "../src/tree/types";

const testInput = `
static const int F = 5;

int test(int v) {
  switch (v) {
    case 1:
    case 2:
      v += F + 0xFF;
      break;
    case 4:
    case 5:
    default:
      return 3;
  } 
  if (v < 2) {
    for (long a = 3; a < 5; a++) {
      return (int) (3.0f);
    }
  } else {
    return v < 2 ? 1 : v * test(v - 1);
  }
}
`.trimStart();

let currentId = 0;
let displayedMap: WeakMap<any, number> = new WeakMap();

function getId(obj: object): [id: number, isNew: boolean] {
    let id = displayedMap.get(obj);
    if (id === undefined) {
        id = ++currentId;
        displayedMap.set(obj, id);
        return [id, true];
    }
    return [id, false];
}

function displayObject(parent: HTMLElement, key: string, obj: any): void {
    const li = document.createElement("li");
    parent.appendChild(li);
    if (typeof obj !== "object") {
        li.innerHTML = `<span class="key">${key}:</span> ${obj}`;
        return;
    }

    // body for this element
    const [id, idNew] = getId(obj);
    li.classList.add(`objID${id}`);
    if (idNew) li.id = `objID${id}`;
    li.innerHTML = `<span class="key">${key}:</span> <code>${Object.getPrototypeOf(obj).constructor.name}</code>`;
    if (idNew) {
        li.innerHTML += ` <span class="id">[${id}]</span>`;
    } else {
        li.innerHTML += ` <a class="id" href="#objID${id}">${id}</a>`;
    }

    // add children
    if (idNew || obj instanceof CArithmetic) {
        // tree setup
        li.classList.add("expandable");
        li.addEventListener("click", e => {
            e.stopPropagation();
            const rect = li.getBoundingClientRect();
            if (e.clientX < rect.left + 20 && e.clientY < rect.top + 20) {
                li.classList.toggle("hidden");
            }
        });

        const ul = document.createElement("ul");
        li.appendChild(ul);

        if (obj instanceof Map) {
            for (const [key, value] of obj.entries()) {
                displayObject(ul, key, value);
            }
        } else {
            for (const [key, value] of Object.entries(obj)) {
                if (key === "node") continue;
                displayObject(ul, key, value);
            }
        }

        if (ul.children.length === 0) {
            // no children found - remove sublist
            ul.remove();
            li.classList.remove("expandable");
        }
    }
}

function update(input: string) {
    const top = window.document.getElementById("identifiers");
    const errors = window.document.getElementById("errors");
    if (!top || !errors) throw new Error("Element not found");
    top.innerHTML = "";
    currentId = 0;
    displayedMap = new WeakMap<any, number>();

    let ir;
    try {
        ir = toIR(input);
    } catch (e) {
        errors.innerText = e.toString();
        throw e;
    }

    errors.innerHTML = "";
    for (const [key, value] of (ir as any).identifiers) {
        displayObject(top, key, value);
    }
}


if (typeof window !== 'undefined' && window.document) {
    window.document.write(`
        <h1>c2wasm ctree</h1>
        <div>
            <textarea id="textInput" rows="20" style="width: 100%">${testInput}</textarea>

            <pre id="errors"></pre>
            <ul id="identifiers" class="treelist"></ul>
        </div>

        <style>
            ul.treelist {
                padding: 0;
            }

            ul.treelist ul {
              padding-inline-start: 18px;
              border-left: 1px dashed black;
              margin-left: 6px;
            }

            ul.treelist li {
              list-style-type: none;
              position: relative;
            }

            ul.treelist li::before {
              content: "\\25BB";
              font-size: 0.8em;
              color: black;
              user-select: none;
              pointer-events: auto;
              display: inline-block;
              width: 20px;
            }

            ul.treelist li.expandable::before {
              content: "\\25BC";
              cursor: pointer;
            }

            ul.treelist li.expandable.hidden::before {
              content: "\\25B6";
              transform: none;
            }

            ul.treelist li.expandable.hidden ul {
              display: none;
            }
        </style>
    `);

    const textInput = window.document.getElementById("textInput") as HTMLTextAreaElement;
    textInput.addEventListener("input", () => update(textInput.value));
    update(textInput.value);
} else {
    console.log(toIR(testInput));
}
