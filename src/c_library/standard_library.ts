import {sourceBundle} from "./source_bundle";

// Load standard library from filesystem if available, or fall back to cached JSON (e.g. in web browser)
const lib = sourceBundle({
    name: "standard library",
    cacheFile: __dirname + "/_standard_library.json",
    sourceFolder: __dirname + "/impl/",
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require: () => require("./_standard_library.json") as {[s: string]: string}
});

export const STANDARD_LIBRARY = lib as ReadonlyMap<string, string>;
export const LIBRARY_HEADERS = (() => {
    const map = new Map<string, string>();
    for (const [path, data] of lib.entries()) {
        if (path.endsWith(".h")) map.set(path, data);
    }
    return map as ReadonlyMap<string, string>;
})();
