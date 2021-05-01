import {setFlags} from "../src";
import {mainWrapper} from "../src/c_library/runtime/args";
import {Files} from "../src/c_library/runtime/files";
import {loadBundle} from "../src/c_library/source_bundle";
import {compile} from "../src/";

function writeRow(text: string = "", body: string = "") {
    const div = document.createElement("div");
    if (text) div.innerText = text;
    if (body) div.innerHTML += '\n' + body;

    const parent = document.createElement("div");
    parent.appendChild(div);
    parent.appendChild(document.createElement("hr"));
    document.body.appendChild(parent);
    return div;
}

const FILES = ["jcapimin.c", "jcapistd.c", "jctrans.c", "jcparam.c", "jdatadst.c", "jcinit.c", "jcmaster.c", "jcmarker.c", "jcmainct.c", "jcprepct.c", "jccoefct.c", "jccolor.c", "jcsample.c", "jchuff.c", "jcphuff.c", "jcdctmgr.c", "jfdctfst.c", "jfdctflt.c", "jfdctint.c", "jdapimin.c", "jdapistd.c", "jdtrans.c", "jdatasrc.c", "jdmaster.c", "jdinput.c", "jdmarker.c", "jdhuff.c", "jdphuff.c", "jdmainct.c", "jdcoefct.c", "jdpostct.c", "jddctmgr.c", "jidctfst.c", "jidctflt.c", "jidctint.c", "jidctred.c", "jdsample.c", "jdcolor.c", "jquant1.c", "jquant2.c", "jdmerge.c", "jcomapi.c", "jutils.c", "jerror.c", "jmemmgr.c", "jmemnobs.c", "rdppm.c", "rdgif.c", "rdtarga.c", "rdrle.c", "rdbmp.c", "rdswitch.c", "wrppm.c", "wrgif.c", "wrtarga.c", "wrrle.c", "wrbmp.c", "rdcolmap.c", "cdjpeg.c"];

document.body.innerHTML = `
    <h1>JPEG Compression</h1>
    <h3>Using libjpeg 6b compiled in browser</h3>
    <hr>
`;

let downloadTime = performance.now();
writeRow("Fetching sources");
fetch(`examples/libjpeg.json?v=${new Date().getTime()}`).then(async response => {
    const text = await response.text();

    downloadTime = performance.now() - downloadTime;
    writeRow("Downloaded sources ", `- ${(text.length / 1024).toFixed(2)} KiB in ${downloadTime.toFixed(2)}ms (${(text.length * 8 / 1024 / 1024 / (downloadTime / 1000)).toFixed(2)} Mb/s)`);

    const sources = loadBundle(JSON.parse(text) as {[s: string]: string});
    writeRow("Source license:", `
        <style>.hidden { display: none; }</style>
        <div onclick="[...this.children].forEach(x => x.classList.toggle('hidden'));">
            <p><i>Click to expand</i>...</p>
            <pre class="hidden">${sources.get("README")?.match(/LEGAL ISSUES\n=+\n\n([^]+)\n\n[A-Z]+\n/)?.[1]}</pre>
        </div>
    `);

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

    setTimeout(() => compileModule(sources), 100);
}

async function compileProgram(allSources: Map<string, string>, program: "cjpeg" | "djpeg"): Promise<WebAssembly.Module> {
    writeRow("Compiling", `<code>${program}</code>`);

    const sources = new Map<string, string>();
    for (const [filename, contents] of allSources.entries()) {
        if (filename.endsWith(".h") || FILES.includes(filename) || filename === `${program}.c`) {
            sources.set(filename, contents);
        }
    }

    return new Promise(resolve => setTimeout(async () => {
        let module: WebAssembly.Module;
        let compileTime = performance.now();
        try {
            const bytes = compile(sources, {FILES: "1"}).toBytes();
            module = (await WebAssembly.compile(bytes));
        } catch (e) {
            writeRow("Failed ", `<pre>${e.stack}</pre>`);
            return;
        }
        compileTime = performance.now() - compileTime;
        writeRow("Compiled in", `${compileTime.toFixed(2)} ms`);
        resolve(module);
    }, 50));
}

async function compileModule(sources: Map<string, string>) {
    setFlags("none");

    const cjpeg = await compileProgram(sources, "cjpeg");
    const djpeg = await compileProgram(sources, "djpeg");

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/jpeg";
    fileInput.addEventListener("change", e => {
        const file = fileInput.files?.[0];
        if (!file) return;
        writeRow("Reading file ", `<code>${file.name}</code>`);

        const reader = new FileReader();
        reader.onloadend = (e) => {
            const u8 = new Uint8Array(reader.result as ArrayBuffer);
            writeRow("Successfully read ", `${(u8.length / 1024).toFixed(2)} KiB`);

            fileInput.parentElement?.parentElement?.remove();
            reader.onloadend = null;

            setTimeout(() => decompress(cjpeg, djpeg, u8), 100);
        };
        reader.readAsArrayBuffer(file);
    });
    writeRow("Choose file:\xa0").appendChild(fileInput);
}

async function decompress(cjpeg: WebAssembly.Module, djpeg: WebAssembly.Module, file: Uint8Array) {
    console.log(module, file);

    writeRow("Loading image using", "<code>djpeg</code>");

    const map = new Map<string, Uint8Array>();
    map.set("input.jpg", file);

    let output = "";
    function getOutput() {
        const out = output;
        output = "";
        return out;
    }

    const files = new Files(c => output += c, undefined, map);
    console.log(files);

    setTimeout(async () => {
        try {
            const instance = await WebAssembly.instantiate(djpeg, {c2wasm: files.getImports()});
            mainWrapper(instance.exports, ["djpeg", "-bmp", "input.jpg", "input.bmp"]);
        } catch (e) { /* ignored */ }

        if (output) writeRow("Output", `<pre>${getOutput()}</pre>`);

        if ((files.getContents("input.bmp")?.length ?? 0) > 0) {
            setTimeout(() => setupSlider(cjpeg, files, getOutput), 50);
        }
    }, 50);
}

async function setupSlider(cjpeg: WebAssembly.Module, files: Files, getOutput: () => string) {
    const sliderDiv = writeRow("JPEG quality: ");

    const quality = document.createElement("input");
    quality.type = "range";
    quality.min = "1";
    quality.max = "100";
    quality.style.width = "50%";
    sliderDiv.appendChild(quality);

    const qualityOutput = document.createElement("output");
    qualityOutput.value = quality.value;
    sliderDiv.appendChild(qualityOutput);

    const outputRow = writeRow();

    const imageRow = writeRow();
    const image = document.createElement("img");
    image.style.maxWidth = "100vw";
    image.style.maxHeight = "50vh";
    imageRow.appendChild(image);

    async function change() {
        qualityOutput.value = quality.value;
        await compress(parseInt(quality.value), outputRow, image, cjpeg, files, getOutput);
    }

    quality.addEventListener("change", change);
    await change();

    const downloadRow = writeRow("Downloads:", '<br>');
    const originalJPEG = document.createElement("button");
    originalJPEG.innerText = "Original JPEG";
    originalJPEG.addEventListener('click', () => download("input.jpg", files));
    downloadRow.appendChild(originalJPEG);
    const convertedBMP = document.createElement("button");
    convertedBMP.innerText = "Converted BMP";
    convertedBMP.addEventListener('click', () => download("input.bmp", files));
    downloadRow.appendChild(convertedBMP);
    const outputJPEG = document.createElement("button");
    outputJPEG.innerText = "Output JPEG";
    outputJPEG.addEventListener('click', () => download("output.jpg", files));
    downloadRow.appendChild(outputJPEG);
}

async function compress(quality: number, outputDiv: HTMLDivElement, image: HTMLImageElement, cjpeg: WebAssembly.Module, files: Files, getOutput: () => string) {
    setTimeout(async () => {
        try {
            const instance = await WebAssembly.instantiate(cjpeg, {c2wasm: {
                ...files.getImports(),
                __time: () => performance.now()
            }});
            mainWrapper(instance.exports, ["cjpeg", "-q", quality.toFixed(0), "input.bmp", "output.jpg"]);
        } catch (e) { /* ignored */ }

        const output = getOutput();
        const num = Number.parseFloat(output);
        if (!isNaN(num)) {
            outputDiv.innerHTML = `Compressing took ${num.toFixed(2)}ms`;
        } else {
            outputDiv.innerHTML = `Output<br><pre>${output}</pre>`;
        }

        if ((files.getContents("output.jpg")?.length ?? 0) > 0) {
            const jpeg = files.getContents("output.jpg") as Uint8Array;
            const blob = new Blob([jpeg], {type: 'image/jpeg'});
            image.src = URL.createObjectURL(blob);

            outputDiv.innerHTML += `<br>Size: ${(jpeg.length / 1024).toFixed(2)}`;
        }
    }, 50);
}

function download(filename: string, files: Files) {
    const u8 = files.getContents(filename);
    if (!u8) return;

    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([u8], {type: 'image/jpeg'}));
    a.download = filename;
    a.click();
}
