import {byte, typeidx, funcidx, globalidx, tableidx} from "./base_types";
import {encodeU32, encodeUtf8, encodeConstantInstr} from "./encoding";
import {WFunctionBuilder, WFunction, WImportedFunction} from "./functions";
import {WGlobal} from "./global";
import {WInstruction} from "./instructions";
import {encodeVec, ResultType, encodeFunctionType, FunctionType, MemoryType, encodeLimits, ValueType, i32Type} from "./wtypes";

export class ModuleBuilder {
    private _functions: WFunction[] = [];
    private _importedFunctions: WImportedFunction[] = [];
    private _functionTable: (WFunction | WImportedFunction)[] = [];
    private _functionTypes: FunctionType[] = [];
    private _globals: WGlobal[] = [];
    private _memory?: MemoryType;
    private _dataSegments: [offset: number, contents: byte[]][] = [];
    startFunction?: WFunction;
    emitCallback?: () => void;

    function(params: ResultType, returnValue: ResultType, bodyFn?: (b: WFunctionBuilder) => WInstruction[], exportName?: string): WFunction {
        const type: FunctionType = [params, returnValue];
        const fn = new WFunction(this, type, exportName);
        this._functions.push(fn);
        if (bodyFn) fn.define(bodyFn); // have to add to list before defining to enable recursive calls
        return fn;
    }

    importFunction(param: ResultType, returnValue: ResultType, module: string, name: string): WImportedFunction {
        if (this._functions.length > 0) throw new Error("Cannot define an imported functions after defining normal functions");

        const fn = new WImportedFunction(this, [param, returnValue], module, name);
        this._importedFunctions.push(fn);
        return fn;
    }

    global(type: ValueType, mutable: boolean, initialValue: number | bigint, exportName?: string): WGlobal {
        const g = new WGlobal(this, type, mutable, initialValue, exportName);
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
        // remove 0s from the start
        let startIdx = 0;
        while (startIdx < contents.length && contents[startIdx] === 0) startIdx++;
        // always slice to ensure we take a copy
        contents = contents.slice(startIdx);
        offset += startIdx;

        // remove 0s from the end
        while (contents.length && contents[contents.length - 1] === 0) contents.pop();

        if (contents.length) this._dataSegments.push([offset, contents as byte[]]);
    }

    private byteList(): byte[] {
        const imports = this._encodeImports();
        const funcTypes = this._functions.map(x => encodeU32(this._typeIndex(x.type)));
        const code = this._functions.map(x => x.toBytes());
        if (this.emitCallback) this.emitCallback();

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
            ...encodeSection(1, this._functionTypes.map(encodeFunctionType)), // type section
            ...encodeSection(2, imports), // import section
            ...encodeSection(3, funcTypes), // function section,
            ...encodeSection(4, this._encodeTable()), // table section
            ...encodeSection(5, this._memory ? [encodeLimits(this._memory)] : []), // memory section
            ...encodeSection(6, this._globals.map(x => x.toBytes())), // globals section
            ...encodeSection(7, this._encodeExports()), // export section
            ...startSection, // 8, start function section
            ...encodeSection(9, this._encodeElements()),
            ...encodeSection(10, code), // code section
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
            imports.push([...encodeUtf8(i.module), ...encodeUtf8(i.name), 0x00 as byte, ...encodeU32(this._typeIndex(i.type))]);
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
            ...encodeConstantInstr(0, i32Type), 0x0B as byte, // i32.const expression
            ...encodeVec(this._functionTable.map(x => encodeU32(x.getIndex())))]];
    }

    private _encodeDataSegments(): byte[][] {
        if (this._dataSegments.length > 0 && this._memory === undefined) {
            throw new Error("Cannot use data segments with memory disabled");
        }

        // sort into offset order
        this._dataSegments.sort((a,b) => a[0] - b[0]);

        // merge segments
        let lastEnd = -Infinity;
        for (let i = 0; i < this._dataSegments.length; i++) {
            const [offset, contents] = this._dataSegments[i];
            if (lastEnd + 5 >= offset) { // between each segment min 5 byte overhead (0x00, 0x41, [offset], 0x0B, [size])
                const previousContents = this._dataSegments[i - 1][1];
                for (let i = lastEnd; i < offset; i++) previousContents.push(0 as byte);
                previousContents.push(...contents);

                this._dataSegments.splice(i, 1); // remove this segment now we have merged
                i--;
            }
            lastEnd = offset + contents.length;
        }

        // convert each offset into `expression(i32.const offset)`
        return this._dataSegments.map(([offset, contents]) => [0x00 as byte,
            ...encodeConstantInstr(offset, i32Type), 0x0B as byte, // i32.const expression
            ...encodeU32(BigInt(contents.length)), ...contents]); // byte vector
    }

    _funcIndex(fn: WFunction | WImportedFunction): funcidx {
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

    _tableIndex(fn: WFunction | WImportedFunction): tableidx {
        let idx = this._functionTable.indexOf(fn);
        if (idx < 0) {
            idx = this._functionTable.push(fn) - 1;
        }
        return BigInt(idx) as tableidx;
    }

    _typeIndex(x: FunctionType): typeidx {
        for (let i = 0; i < this._functionTypes.length; i++) {
            const f = this._functionTypes[i];
            if (f[0].length === x[0].length && f[0].every((v, i) => v === x[0][i]) &&
                f[1].length === x[1].length && f[1].every((v, i) => v === x[1][i])) {
                return BigInt(i) as typeidx;
            }
        }
        return BigInt(this._functionTypes.push(x) - 1) as typeidx;
    }

    _globalIndex(g: WGlobal): globalidx {
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

    _functionLookup(f: funcidx): WFunction | WImportedFunction {
        if (f < this._importedFunctions.length) return this._importedFunctions[Number(f)];
        return this._functions[Number(f) - this._importedFunctions.length];
    }

    _typeLookup(t: typeidx): FunctionType {
        return this._functionTypes[Number(t)];
    }

    _globalLookup(g: globalidx): WGlobal {
        return this._globals[Number(g)];
    }

    _inFunctionTable(f: WFunction | WImportedFunction): boolean {
        return this._functionTable.indexOf(f) >= 0;
    }

    _removeFunction(f: WFunction): void {
        const idx = this._functions.indexOf(f);
        if (idx >= 0) this._functions.splice(idx, 1);
    }
}

function encodeSection(id: number, vec: byte[][]): byte[] {
    if (vec.length === 0) return [];

    const contents = encodeVec(vec);
    return [id as byte, ...encodeU32(BigInt(contents.length)), ...contents];
}
