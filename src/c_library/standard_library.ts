import fs from "fs";

/*
Load standard library from filesystem if available, or fall back to cached JSON (e.g. in web browser)
 */

const JSON_CACHE = __dirname + "/_standard_library.json";
const IMPL_FOLDER = __dirname + "/impl/";

function list(folder: string, baseFolder: string, files: Map<string, string> = new Map<string, string>()){
    for (const path of fs.readdirSync(baseFolder + folder)){
        const name = folder.length > 0 ? folder + '/' + path : path;

        if (fs.statSync(baseFolder + name).isDirectory()){
            list(name, baseFolder, files);
        } else {
            files.set(name, fs.readFileSync(baseFolder + name, "utf8").replace(/\r\n/g, "\n"));
        }
    }
    return files;
}

function cacheOutOfDate(lib: Map<string, string>): boolean {
    if (fs.existsSync(JSON_CACHE)) {
        const contents = fs.readFileSync(JSON_CACHE, "utf-8");
        const json = JSON.parse(contents);
        if (Object.values(json).length !== lib.size) return true;
        for (const [path, contents] of lib.entries()) {
            if (json[path] !== contents) return true;
        }
        return false;
    }
    return true;
}

function updateCache(lib: Map<string, string>) {
    console.log("[standard library]: cache out of date\n");

    const obj: {[s: string]: string} = {};
    for (const [path, contents] of lib.entries()) {
        obj[path] = contents;
    }

    fs.writeFileSync(JSON_CACHE, JSON.stringify(obj));
}

let lib: Map<string, string>;
if (Object.prototype.hasOwnProperty.call(fs, "readdirSync")) {
    lib = list("", IMPL_FOLDER);

    try {
        if (cacheOutOfDate(lib)) updateCache(lib);
    } catch (e) {
        console.warn(e);
    }
} else {
    lib = new Map<string, string>();

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const obj = require("./_standard_library.json") as {[s: string]: string};
    Object.entries(obj).forEach(([path, contents]) => lib.set(path, contents));
}

export const LIBRARY_HEADERS = (() => {
    const map = new Map<string, string>();
    for (const [path, data] of lib.entries()) {
        if (path.endsWith(".h")) map.set(path, data);
    }
    return map as ReadonlyMap<string, string>;
})();
export const LIBRARY_SOURCE = (() => {
    const map = new Map<string, string>();
    for (const [path, data] of lib.entries()) {
        if (path.endsWith(".c")) map.set(path, data);
    }
    return map as ReadonlyMap<string, string>;
})();
