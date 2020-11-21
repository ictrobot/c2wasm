import {STANDARD_LIBRARY} from "./c_library/standard_library";
import {WGenerator} from "./generation";
import {Linker} from "./linker";
import {ModuleBuilder} from "./wasm";

export function compile(files: ReadonlyMap<string, string> | string, library: () => Linker | undefined = stdLibrary): ModuleBuilder {
    if (typeof files === "string") {
        const f = new Map<string, string>();
        f.set("main.c", files);
        files = f;
    }

    // "linker" also calls preprocessor, lexer, parser and pt transformation into IR
    const linker = new Linker(files);
    if (library) {
        linker.link(library());
    } else {
        linker.link();
    }

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

let _standardLibrary: Linker | undefined;
export function stdLibrary(): Linker {
    if (!_standardLibrary) {
        _standardLibrary = new Linker(STANDARD_LIBRARY);
        _standardLibrary.link();
    }
    return _standardLibrary;
}
