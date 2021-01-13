import {STANDARD_LIBRARY} from "./c_library/standard_library";
import {WGenerator} from "./generation";
import {Linker} from "./linker";
import {ModuleBuilder} from "./wasm";

export function compile(files: ReadonlyMap<string, string> | string,
                        customDefinitions?: {[key: string]: string}): ModuleBuilder {
    if (typeof files === "string") {
        const f = new Map<string, string>();
        f.set("main.c", files);
        files = f;
    }

    // "linker" also calls preprocessor, lexer, parser and pt transformation into IR
    const linker = new Linker(files, true, customDefinitions);
    linker.link(stdLibrary(customDefinitions));

    const generator = new WGenerator(linker);
    return generator.module;
}

/** No access to standard library! */
export function compileSnippet(source: string): ModuleBuilder {
    const fileMap = new Map<string, string>();
    fileMap.set("main.c", source);

    const linker = new Linker(fileMap, false);
    linker.link();
    return new WGenerator(linker).module;
}

const _standardLibrary = new Map<string, Linker>();
export function stdLibrary(customDefinitions?: {[key: string]: string}): Linker {
    const definitionsJson = JSON.stringify(customDefinitions);
    let lib = _standardLibrary.get(definitionsJson);
    if (!lib) {
        lib = new Linker(STANDARD_LIBRARY, true, customDefinitions);
        lib.link();
    }
    return lib;
}
