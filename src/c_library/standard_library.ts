import lib from "./_standard_library.json";

export const STANDARD_LIBRARY = new Map(Object.entries(lib)) as ReadonlyMap<string, string>;

export const LIBRARY_HEADERS = (() => {
    const map = new Map<string, string>();
    for (const [path, data] of STANDARD_LIBRARY.entries()) {
        if (path.endsWith(".h")) map.set(path, data);
    }
    return map as ReadonlyMap<string, string>;
})();
