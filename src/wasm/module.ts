import {byte, u32, typeidx, funcidx} from "./base_types";
import {encodeU32, encodeUtf8} from "./encoding";
import {WFunctionBuilder, WFunction, WImportedFunction} from "./functions";
import {encodeVec, ResultType, encodeFunctionType, FunctionType, MemoryType, encodeLimits} from "./wtypes";

export class ModuleBuilder {
    private _functions: WFunction[] = [];
    private _importedFunctions: WImportedFunction[] = [];
    private _memory?: MemoryType;

    function(params: ResultType, returnValue: ResultType,
             body: (b: WFunctionBuilder) => (() => byte[])[], exportName?: string): WFunction {
        const builder = new WFunctionBuilder(this, params);
        const instructions = body(builder);
        const type: FunctionType = [params, returnValue];

        const fn = new WFunction(this._funcIndex.bind(this), type, builder.localTypes, instructions, exportName);
        builder._getIndex = fn.getIndex.bind(fn); // enable recursive calls in builder
        this._functions.push(fn);
        return fn;
    }

    importFunction(param: ResultType, returnValue: ResultType, module: string, name: string): WImportedFunction {
        const fn = new WImportedFunction(this._funcIndex.bind(this), [param, returnValue], module, name);
        this._importedFunctions.push(fn);
        return fn;
    }

    setupMemory(initial64kPages: number, maximum64kPages?: number): void {
        if (initial64kPages < 1 || (maximum64kPages !== undefined && maximum64kPages < initial64kPages)) {
            throw new Error("Invalid memory size");
        }

        if (maximum64kPages === undefined) {
            this._memory = [BigInt(initial64kPages) as u32];
        } else {
            this._memory = [BigInt(initial64kPages) as u32, BigInt(maximum64kPages) as u32];
        }
    }

    private byteList(): byte[] {
        const types: byte[][] = [];
        const imports = this._encodeImports(types);
        const funcTypes = this._functions.map(x => encodeU32(getTypeIndex(x.type, types)));

        return [
            0x00, 0x61, 0x73, 0x6D, // magic
            0x01, 0x00, 0x00, 0x00, // version
            ...encodeSection(1, types), // type section
            ...encodeSection(2, imports), // import section
            ...encodeSection(3, funcTypes), // function section,
            ...encodeSection(5, this._memory ? [encodeLimits(this._memory)] : []), // memory section
            ...encodeSection(7, this._encodeExports()),

            ...encodeSection(10, this._functions.map(x => x.toBytes())) // code section
        ] as byte[];
    }

    toBytes(): Uint8Array {
        return new Uint8Array(this.byteList());
    }

    async execute(imports: WebAssembly.Imports): Promise<WebAssembly.Exports> {
        const module = await WebAssembly.instantiate(this.toBytes(), imports);
        return module.instance.exports;
    }

    private _encodeImports(funcTypes: byte[][]): byte[][] {
        const imports: byte[][] = [];

        for (const i of this._importedFunctions) {
            imports.push([...encodeUtf8(i.module), ...encodeUtf8(i.name), 0x00 as byte, ...encodeU32(getTypeIndex(i.type, funcTypes))]);
        }

        return imports;
    }

    private _encodeExports(): byte[][] {
        const exports: byte[][] = [];

        for (const i of this._functions) {
            if (i.exportName) exports.push([...encodeUtf8(i.exportName), 0x00 as byte, ...encodeU32(i.getIndex())]);
        }

        return exports;
    }

    private _funcIndex(fn: WFunction | WImportedFunction): funcidx {
        let idx: number;
        if (fn instanceof WImportedFunction) {
            idx = this._importedFunctions.indexOf(fn);
        } else {
            idx = this._functions.indexOf(fn);
        }
        if (idx < 0) throw "Function not found?";
        if (fn instanceof WFunction) idx += this._importedFunctions.length;
        return BigInt(idx) as funcidx;
    }
}

function getTypeIndex(x: FunctionType, list: byte[][]): typeidx {
    const encoded = encodeFunctionType(x);
    for (let i = 0; i < list.length; i++) {
        if (list[i].length === encoded.length && list[i].every((v, i) => v === encoded[i])) {
            return BigInt(i) as typeidx;
        }
    }
    return BigInt(list.push(encoded) - 1) as typeidx;
}

function encodeSection(id: number, vec: byte[][]): byte[] {
    if (vec.length === 0) return [];

    const contents = encodeVec(vec);
    return [id as byte, ...encodeU32(BigInt(contents.length) as u32), ...contents];
}
