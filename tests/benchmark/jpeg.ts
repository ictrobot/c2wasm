import * as fs from "fs";
import {compile, runtime, setFlags} from "../../src";

const dir = __dirname + "/jpeg/src/";

const LIBJPEG = ["jcapimin.c", "jcapistd.c", "jctrans.c", "jcparam.c", "jdatadst.c", "jcinit.c", "jcmaster.c", "jcmarker.c", "jcmainct.c", "jcprepct.c", "jccoefct.c", "jccolor.c", "jcsample.c", "jchuff.c", "jcphuff.c", "jcdctmgr.c", "jfdctfst.c", "jfdctflt.c", "jfdctint.c", "jdapimin.c", "jdapistd.c", "jdtrans.c", "jdatasrc.c", "jdmaster.c", "jdinput.c", "jdmarker.c", "jdhuff.c", "jdphuff.c", "jdmainct.c", "jdcoefct.c", "jdpostct.c", "jddctmgr.c", "jidctfst.c", "jidctflt.c", "jidctint.c", "jidctred.c", "jdsample.c", "jdcolor.c", "jquant1.c", "jquant2.c", "jdmerge.c", "jcomapi.c", "jutils.c", "jerror.c", "jmemmgr.c", "jmemnobs.c"];
const CDJPEG = [...LIBJPEG, "rdppm.c", "rdgif.c", "rdtarga.c", "rdrle.c", "rdbmp.c", "rdswitch.c", "wrppm.c", "wrgif.c", "wrtarga.c", "wrrle.c", "wrbmp.c", "rdcolmap.c", "cdjpeg.c"];
//const JPEGTRAN = [...LIBJPEG, "jpegtran.c", "rdswitch.c", "cdjpeg.c", "transupp.c"];

// TODO fix PRE
setFlags({partial_redundancy_elimination: false, inlining: true});

(async () => {
    function jpegCompile(name: string, sources: string[]): Promise<WebAssembly.Module> {
        const source = new Map<string, string>();
        fs.readdirSync(dir).filter(x => x.endsWith(".h") || sources.includes(x)).forEach(name =>
            source.set(name, fs.readFileSync(dir + name, {encoding: "utf-8"})));

        const bytes = compile(source, {FILES: "1"}).toBytes();
        fs.writeFileSync(`${__dirname}/${name}.wasm`, bytes);
        return WebAssembly.compile(bytes);
    }

    const cjpeg = await jpegCompile("cjpeg", [...CDJPEG, "cjpeg.c"]);
    const djpeg = await jpegCompile("djpeg", [...CDJPEG, "djpeg.c"]);

    const dataset = new Map<string, Uint8Array>();
    fs.readdirSync(dir).filter(x => x.startsWith("test")).forEach(name =>
        dataset.set(name, new Uint8Array(fs.readFileSync(dir + name, {}).buffer)));
    const files = new runtime.Files((c) => process.stdout.write(c), undefined, dataset);

    // Testing:
    function equal(u8arr1: Uint8Array, u8arr2: Uint8Array) {
        if (u8arr1.byteLength !== u8arr2.byteLength) return false;
        for (let i = 0 ; i < u8arr1.byteLength ; i++) {
            if (u8arr1[i] !== u8arr2[i]) return false;
        }
        return true;
    }

    async function test(m: WebAssembly.Module, cmdline: string[], outputFile: string, compareAgainst?: string) {
        const module = await WebAssembly.instantiate(m, {c2wasm: files.getImports()});
        try {
            runtime.mainWrapper(module.exports, cmdline);
        } catch (e) {
            console.log(e);
        }

        const contents = files.getContents(outputFile);
        if (!contents) throw new Error("Failed test");
        fs.writeFileSync(outputFile, contents);

        if (!compareAgainst) return;
        const targetContents = files.getContents(compareAgainst);
        if (!targetContents) throw new Error("Couldn't find target file");
        if (equal(contents, targetContents)) {
            console.log(`${outputFile} matches ${compareAgainst}`);
        } else {
            throw new Error("Failed test - output does not match target");
        }
    }

    await test(djpeg, ["djpeg", "testorig.jpg", "outimg.ppm"], "outimg.ppm", "testimg.ppm");
    await test(djpeg, ["djpeg", "-bmp", "-colours", "256", "testorig.jpg", "outimg.bmp"], "outimg.bmp", "testimg.bmp");
    await test(cjpeg, ["cjpeg", "testimg.ppm", "outimg.jpg"], "outimg.jpg");


    // compile(source, {
    //     FILES: "1", // enable file support
    // }).execute({
    //     c2wasm: files.getImports()
    // }).then(module => {
    //     try {
    //         runtime.mainWrapper(module, ["cjpeg", "-q", "80", "testimg.bmp", "output.jpg"]);
    //     } catch (e) {
    //     }
    //     fs.writeFileSync("output.jpg", files.getContents("output.jpg")!);
    //     console.log(files);
    // });

})();
