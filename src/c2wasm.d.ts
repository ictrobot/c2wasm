export declare function compile(files: ReadonlyMap<string, string> | string, customDefinitions?: {
    [key: string]: string;
}): c2wasm.CModule;

/** No access to standard library! */
export declare function compileSnippet(source: string): c2wasm.CModule;

export declare function setFlags(flags: Partial<c2wasm.OptimizationFlags> | "none" | "default"): void;

export declare function getFlags(): c2wasm.OptimizationFlags;

declare namespace c2wasm {
    interface CModule {
        toBytes(): Uint8Array;
        execute(imports: WebAssembly.Imports): Promise<WebAssembly.Exports>;
        functions: ReadonlyArray<{
            readonly type: FunctionType;
            readonly exportName?: string;
        }>;
        functionImports: ReadonlyArray<{
            readonly type: FunctionType;
            readonly module: string;
            readonly name: string;
        }>;
    }

    type FunctionType = [parameters: number[], results: number[]];

    type OptimizationFlags = {
        [k: string]: boolean;
    };
}
export {};
