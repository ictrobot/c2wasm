import fs from "fs";

export interface Bundle {
    readonly name: string;
    readonly cacheFile: string;
    readonly sourceFolder: string;
    readonly require: () => {[filename: string]: string};
    readonly simplify?: boolean;
}

/**
 * Load C source from filesystem if available, or fall back to cached JSON (e.g. in web browser)
 */
export function sourceBundle(bundle: Bundle): Map<string, string> {
    function folderContents(folder: string, baseFolder: string, files: Map<string, string> = new Map<string, string>()){
        for (const path of fs.readdirSync(baseFolder + folder)){
            const name = folder.length > 0 ? folder + '/' + path : path;

            if (fs.statSync(baseFolder + name).isDirectory()){
                folderContents(name, baseFolder, files);
            } else {
                const readme = path.toLowerCase().includes("readme") || path.toLowerCase().includes("licen");
                const source = path.endsWith(".h") || path.endsWith(".c");
                if (!readme && !source) continue;

                let contents = fs.readFileSync(baseFolder + name, "utf8")
                    .replace(/\r\n/g, "\n"); // convert CRLF
                if (source && bundle.simplify !== false) {
                    contents = contents.replace(/(?:\/\*[^]*?\*\/)|(?:\/\/.*?$)/gm, " ") // remove comments
                        .replace(/^(?:[ \t]*\n+|[ \t]+)/gm, ""); // remove leading whitespace and empty lines
                }

                files.set(name, contents);
            }
        }
        return files;
    }

    function checkCache(lib: Map<string, string>): boolean {
        if (fs.existsSync(bundle.cacheFile)) {
            const contents = fs.readFileSync(bundle.cacheFile, "utf-8");
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
        console.debug(`[${bundle.name}]: source cache out of date`);

        const obj: {[s: string]: string} = {};
        for (const [path, contents] of lib.entries()) {
            obj[path] = contents;
        }

        fs.writeFileSync(bundle.cacheFile, JSON.stringify(obj));
    }

    if (Object.prototype.hasOwnProperty.call(fs, "readdirSync") && fs.existsSync(bundle.sourceFolder)) {
        // load from file system
        const lib = folderContents("", bundle.sourceFolder);

        // update cache if needed
        try {
            if (checkCache(lib)) updateCache(lib);
        } catch (e) {
            console.warn(e);
        }
        return lib;
    } else {
        // load from cache
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const obj = bundle.require();
        return loadBundle(obj);
    }
}

export function loadBundle(obj: {[s: string]: string}) {
    const lib = new Map<string, string>();
    Object.entries(obj).forEach(([path, contents]) => lib.set(path, contents));
    return lib;
}
