import {funcidx, localidx, byte, u32} from "./base_types";
import {encodeU32} from "./encoding";
import {ModuleBuilder} from "./module";
import {ValueType, ResultType, FunctionType, encodeVec} from "./wtypes";


export class WImportedFunction {
    constructor(private readonly idxFn: (x: WImportedFunction) => funcidx,
                readonly type: FunctionType,
                readonly module: string,
                readonly name: string) {
    }

    getIndex(): funcidx {
        return this.idxFn(this);
    }
}

export class WFunction {
    constructor(private readonly idxFn: (x: WFunction) => funcidx,
                readonly type: FunctionType,
                readonly locals: ValueType[],
                readonly body: (() => byte[])[],
                readonly exportName?: string) {
    }

    getIndex(): funcidx {
        return this.idxFn(this);
    }

    toBytes(): byte[] {
        // RLE is used to compress locals
        const locals: [count: bigint, type: ValueType][] = [];
        let lastType: ValueType | null = null;
        let count = 0n;
        for (const local of this.locals) {
            if (local === lastType) {
                count++;
            } else {
                if (lastType) locals.push([count, lastType]);
                lastType = local;
                count = 1n;
            }
        }
        if (lastType) locals.push([count, lastType]);

        // encode function body
        const code: byte[] = encodeVec(locals.map(x => [...encodeU32(x[0] as u32), x[1]])); // locals
        code.push(...this.body.map(x => x()).flat(), 0x0B as byte); // expression
        code.unshift(...encodeU32(BigInt(code.length) as u32));
        return code;
    }
}

export class WFunctionBuilder {
    private readonly _arguments: WLocal[];
    private readonly _locals: WLocal[] = [];
    _getIndex?: () => funcidx;

    constructor(readonly parent: ModuleBuilder, args: ResultType) {
        this._arguments = args.map(t => new WLocal(this._localidx.bind(this), t));
    }

    get locals(): ReadonlyArray<WLocal> {
        return this._locals;
    }

    get localTypes(): ValueType[] {
        return this._locals.map(x => x.type);
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
        return {
            getIndex: () => {
                if (this._getIndex) return this._getIndex();
                throw "Function still in construction";
            }
        };
    }

    private _localidx(l: WLocal) {
        let idx = this._arguments.indexOf(l);
        if (idx >= 0) return BigInt(idx) as localidx;
        idx = this._locals.indexOf(l);
        if (idx >= 0) return BigInt(this._arguments.length + idx) as localidx;
        throw "Local not found?";
    }
}


class WLocal {
    constructor(private readonly lookup: (l: WLocal) => localidx, readonly type: ValueType) {
    }

    getIndex(): localidx {
        return this.lookup(this);
    }
}
