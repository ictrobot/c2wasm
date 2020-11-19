import {byte, typeidx, funcidx, globalidx, tableidx} from "./base_types";
import {encodeU32, encodeUtf8} from "./encoding";
import {WFunctionBuilder, WFunction, WImportedFunction} from "./functions";
import {WGlobal} from "./global";
import {WExpression, Instructions} from "./instructions";
import {encodeVec, ResultType, encodeFunctionType, FunctionType, MemoryType, encodeLimits, ValueType} from "./wtypes";

export class ModuleBuilder {
    private _functions: WFunction[] = [];
    private _importedFunctions: WImportedFunction[] = [];
    private _functionTable: (WFunction | WImportedFunction)[] = [];
    private _functionTypes: byte[][] = [];
    private _globals: WGlobal[] = [];
    private _memory?: MemoryType;
    private _dataSegments: [offset: number, contents: byte[]][] = [];
    startFunction?: WFunction;

    function(params: ResultType, returnValue: ResultType, bodyFn: (b: WFunctionBuilder) => WExpression, exportName?: string): WFunction {
        const builder = new WFunctionBuilder(this, params, bodyFn);
        const type: FunctionType = [params, returnValue];

        const fn = new WFunction(this._funcIndex.bind(this), this._tableIndex.bind(this), type, builder, exportName);
        builder._getIndex = fn.getIndex.bind(fn); // enable recursive calls in builder
        this._functions.push(fn);
        return fn;
    }

    importFunction(param: ResultType, returnValue: ResultType, module: string, name: string): WImportedFunction {
        const fn = new WImportedFunction(this._funcIndex.bind(this), this._tableIndex.bind(this), [param, returnValue], module, name);
        this._importedFunctions.push(fn);
        return fn;
    }

    global(type: ValueType, mutable: boolean, initialValue: number | bigint, exportName?: string): WGlobal {
        const g = new WGlobal(this._globalIndex.bind(this), type, mutable, initialValue, exportName);
        this._globals.push(g);
        return g;
    }

    setupMemory(initial64kPages: number, maximum64kPages?: number): void {
        if (initial64kPages < 1 || (maximum64kPages !== undefined && maximum64kPages < initial64kPages)) {
            throw new Error("Invalid memory size");
        }

        if (maximum64kPages === undefined) {
            this._memory = [BigInt(initial64kPages)];
        } else {
            this._memory = [BigInt(initial64kPages), BigInt(maximum64kPages)];
        }
    }

    dataSegment(offset: number, contents: byte[] | number[]): void {
        this._dataSegments.push([offset, contents as byte[]]);
    }

    private byteList(): byte[] {
        const imports = this._encodeImports();
        const funcTypes = this._functions.map(x => encodeU32(this.typeIndex(x.type)));

        const startSection: byte[] = [];
        if (this.startFunction) {
            startSection.push(...encodeU32(this.startFunction.getIndex()));
            // do section encoding manually as this is the only non-vector section
            startSection.unshift(8 as byte, ...encodeU32(BigInt(startSection.length)));
        }

        // TODO name custom section for local names (+ fn names?)
        return [
            0x00, 0x61, 0x73, 0x6D, // magic
            0x01, 0x00, 0x00, 0x00, // version
            ...encodeSection(1, this._functionTypes), // type section
            ...encodeSection(2, imports), // import section
            ...encodeSection(3, funcTypes), // function section,
            ...encodeSection(4, this._encodeTable()), // table section
            ...encodeSection(5, this._memory ? [encodeLimits(this._memory)] : []), // memory section
            ...encodeSection(6, this._globals.map(x => x.toBytes())), // globals section
            ...encodeSection(7, this._encodeExports()), // export section
            ...startSection, // 8, start function section
            ...encodeSection(9, this._encodeElements()),
            ...encodeSection(10, this._functions.map(x => x.toBytes())), // code section
            ...encodeSection(11, this._encodeDataSegments()) // data segments section
        ] as byte[];
    }

    toBytes(): Uint8Array {
        return new Uint8Array(this.byteList());
    }

    async execute(imports: WebAssembly.Imports): Promise<WebAssembly.Exports> {
        const module = await WebAssembly.instantiate(this.toBytes(), imports);
        return module.instance.exports;
    }

    private _encodeImports(): byte[][] {
        const imports: byte[][] = [];

        for (const i of this._importedFunctions) {
            imports.push([...encodeUtf8(i.module), ...encodeUtf8(i.name), 0x00 as byte, ...encodeU32(this.typeIndex(i.type))]);
        }

        return imports;
    }

    private _encodeTable(): byte[][] {
        if (this._functionTable.length === 0) return [];

        const tableSize = BigInt(this._functionTable.length);
        const table: byte[] = [0x70 as byte, ...encodeLimits([tableSize, tableSize])];
        return [table];
    }

    private _encodeExports(): byte[][] {
        const exports: byte[][] = [];

        for (const i of this._functions) {
            if (i.exportName) exports.push([...encodeUtf8(i.exportName), 0x00 as byte, ...encodeU32(i.getIndex())]);
        }
        for (const i of this._globals) {
            if (i.exportName) exports.push([...encodeUtf8(i.exportName), 0x03 as byte, ...encodeU32(i.getIndex())]);
        }
        if (this._memory) exports.push([...encodeUtf8("__mem"), 0x02 as byte, 0x00 as byte]);

        return exports;
    }

    private _encodeElements(): byte[][] {
        if (this._functionTable.length === 0) return [];

        return [[0x00 as byte,
            ...Instructions.i32.const(0)(), 0x0B as byte, // i32.const expression
            ...encodeVec(this._functionTable.map(x => encodeU32(x.getIndex())))]];
    }

    private _encodeDataSegments(): byte[][] {
        if (this._dataSegments.length > 0 && this._memory === undefined) {
            throw new Error("Cannot use data segments with memory disabled");
        }

        // convert each offset into `expression(i32.const offset)`
        return this._dataSegments.map(([offset, contents]) => [0x00 as byte,
            ...Instructions.i32.const(offset)(), 0x0B as byte, // i32.const expression
            ...encodeU32(BigInt(contents.length)), ...contents]); // byte vector
    }

    private _funcIndex(fn: WFunction | WImportedFunction): funcidx {
        let idx: number;
        if (fn instanceof WImportedFunction) {
            idx = this._importedFunctions.indexOf(fn);
        } else {
            idx = this._functions.indexOf(fn);
        }
        if (idx < 0) throw new Error("Function not found?");
        if (fn instanceof WFunction) idx += this._importedFunctions.length;
        return BigInt(idx) as funcidx;
    }

    private _tableIndex(fn: WFunction | WImportedFunction): tableidx {
        let idx = this._functionTable.indexOf(fn);
        if (idx < 0) {
            idx = this._functionTable.push(fn) - 1;
        }
        return BigInt(idx) as tableidx;
    }

    typeIndex(x: FunctionType): typeidx {
        const encoded = encodeFunctionType(x);
        for (let i = 0; i < this._functionTypes.length; i++) {
            if (this._functionTypes[i].length === encoded.length && this._functionTypes[i].every((v, i) => v === encoded[i])) {
                return BigInt(i) as typeidx;
            }
        }
        return BigInt(this._functionTypes.push(encoded) - 1) as typeidx;
    }

    private _globalIndex(g: WGlobal): globalidx {
        const idx = this._globals.indexOf(g);
        if (idx < 0) throw new Error("Global not found?");
        return BigInt(idx) as globalidx;
    }

    get functions(): ReadonlyArray<WFunction> {
        return this._functions;
    }

    get functionImports(): ReadonlyArray<WImportedFunction> {
        return this._importedFunctions;
    }
}

function encodeSection(id: number, vec: byte[][]): byte[] {
    if (vec.length === 0) return [];

    const contents = encodeVec(vec);
    return [id as byte, ...encodeU32(BigInt(contents.length)), ...contents];
}
