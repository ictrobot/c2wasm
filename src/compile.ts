import {LIBRARY_SOURCE} from "./c_library/standard_library";
import {WGenerator} from "./generation";
import {Linker} from "./linker";
import {ModuleBuilder} from "./wasm";

export function compile(files: ReadonlyMap<string, string>, library: Linker | undefined = stdLibrary): ModuleBuilder {
    // "linker" also calls preprocessor, lexer, parser and pt transformation into IR
    const linker = new Linker(files);
    if (library) {
        linker.link(library);
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

const stdLibrary: Linker = new Linker(LIBRARY_SOURCE);
