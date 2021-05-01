import {mkdirSync} from "fs";
import {sourceBundle} from "../../src/c_library/source_bundle";

if (typeof mkdirSync !== "function") throw new Error("Can only be imported locally");

const buildDir = __dirname + "/../../build/examples/";
mkdirSync(buildDir, {recursive: true});

sourceBundle({
    name: "CoreMark",
    cacheFile: buildDir + "/CoreMark.json",
    sourceFolder: __dirname + "/coremark/",
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require() {
        throw new Error();
    },
    simplify: false
});

// sourceBundle({
//     name: "libjpeg",
//     cacheFile: buildDir + "/libjpeg.json",
//     sourceFolder: __dirname + "/jpeg/src/",
//     // eslint-disable-next-line @typescript-eslint/no-var-requires
//     require() {
//         throw new Error();
//     },
//     simplify: false
// });
