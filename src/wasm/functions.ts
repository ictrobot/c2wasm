import exp from "constants";
import {funcidx, localidx, byte, tableidx} from "./base_types";
import {encodeU32} from "./encoding";
import {WExpression, WInstruction} from "./instructions";
import {ModuleBuilder} from "./module";
import {ValueType, FunctionType, encodeVec} from "./wtypes";


export class WImportedFunction {
    constructor(readonly parent: ModuleBuilder, readonly type: FunctionType, readonly module: string, readonly name: string) {
    }

    getIndex(): funcidx {
        return this.parent._funcIndex(this);
    }

    getTableIndex(): tableidx {
        return this.parent._tableIndex(this);
    }
}

export class WFunction {
    private body?: byte[];
    private locals: ValueType[] = [];

    constructor(readonly parent: ModuleBuilder, readonly type: FunctionType, readonly exportName?: string) {
    }

    getIndex(): funcidx {
        return this.parent._funcIndex(this);
    }

    getTableIndex(): tableidx {
        return this.parent._tableIndex(this);
    }

    define(bodyFn: (b: WFunctionBuilder) => WInstruction[]): void {
        if (this.body !== undefined) throw new Error(`Wasm function already defined`);
        [this.body, this.locals] = WFunctionBuilder.build(this, bodyFn);
    }

    toBytes(): byte[] {
        if (this.body === undefined) throw new Error(`Wasm function body not defined`);

        // RLE is used to compress locals
        const locals: [count: bigint, type: ValueType][] = [];
        let lastType: ValueType | null = null;
        let count = 0n;
        for (const localType of this.locals) {
            if (localType === lastType) {
                count++;
            } else {
                if (lastType) locals.push([count, lastType]);
                lastType = localType;
                count = 1n;
            }
        }
        if (lastType) locals.push([count, lastType]);

        // encode function body
        const code: byte[] = encodeVec(locals.map(x => [...encodeU32(x[0]), x[1]])); // locals
        code.push(...this.body, 0x0B as byte); // expression
        code.unshift(...encodeU32(BigInt(code.length)));
        return code;
    }
}

export class WFunctionBuilder {
    private readonly _arguments: WLocal[];
    private readonly _locals: WLocal[] = [];

    private constructor(readonly fn: WFunction) {
        this._arguments = fn.type[0].map(t => new WLocal(this._localidx.bind(this), t));
    }

    get locals(): ReadonlyArray<WLocal> {
        return this._locals;
    }

    addLocal(t: ValueType): WLocal {
        const local = new WLocal(this._localidx.bind(this), t);
        this._locals.push(local);
        return local;
    }

    get args(): ReadonlyArray<WLocal> {
        return this._arguments;
    }

    get self(): {getIndex(): funcidx} {
        return {getIndex: this.fn.getIndex.bind(this.fn)};
    }

    get type(): FunctionType {
        return this.fn.type;
    }

    getLocal(index: localidx): WLocal {
        const i = Number(index);
        if (index < this._arguments.length) return this._arguments[i];
        return this._locals[i - this._arguments.length];
    }

    private _localidx(l: WLocal) {
        let idx = this._arguments.indexOf(l);
        if (idx >= 0) return BigInt(idx) as localidx;
        idx = this._locals.indexOf(l);
        if (idx >= 0) return BigInt(this._arguments.length + idx) as localidx;
        throw "Local not found?";
    }

    static build(fn: WFunction, bodyFn: (b: WFunctionBuilder) => WInstruction[]): [byte[], ValueType[]] {
        const builder = new WFunctionBuilder(fn);
        const expression = new WExpression(null, 0, builder);
        expression.push(...bodyFn(builder));
        return [expression.encoded, builder.locals.map(x => x.type)];
    }
}

export class WLocal {
    constructor(private readonly lookup: (l: WLocal) => localidx, readonly type: ValueType) {
    }

    getIndex(): localidx {
        return this.lookup(this);
    }
}
