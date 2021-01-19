export declare function compile(files: ReadonlyMap<string, string> | string, customDefinitions?: {
    [key: string]: string;
}): CModule;

/** No access to standard library! */
export declare function compileSnippet(source: string): CModule;

export declare function setFlags(flags: Partial<OptimizationFlags> | "none" | "default"): void;

export declare function getFlags(): OptimizationFlags;

export interface CModule {
    toBytes(): Uint8Array;
    execute(imports: WebAssembly.Imports): Promise<WebAssembly.Exports>;
    functions: ReadonlyArray<{readonly type: FunctionType, readonly exportName?: string}>;
    functionImports: ReadonlyArray<{readonly type: FunctionType, readonly module: string, readonly name: string}>;
}

export type FunctionType = [parameters: number[], results: number[]];

export type OptimizationFlags = {[k: string]: boolean};

// runtime support
export namespace runtime {
    export function injectArgs(instance: WebAssembly.Exports, args: string[]): [number, number];

    export function mainWrapper(instance: WebAssembly.Exports, args: string[]): number | bigint | void;

    export interface FileLike {
        get(): number | -1;
        put(c: number): boolean;
        pos(): bigint;
        len(): bigint;
        set_pos(pos: bigint): boolean;
    }

    export class Files {
        constructor(output: (char: string) => void, input?: () => string, files?: Map<string, Uint8Array | runtime.FileLike>);

        getImports(): {
            __get_char: (handle: number) => number;
            __put_char: (handle: number, char: number) => number;
            __get_pos: (handle: number) => bigint;
            __get_len: (handle: number) => bigint;
            __set_pos: (handle: number, pos: bigint) => number;
            __exists: () => number;
            __move: () => number;
            __get_fhandle: () => number;
        }

        getContents(filename: string): Uint8Array | undefined;
    }
}
