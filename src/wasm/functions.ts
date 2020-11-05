import {funcidx, localidx, byte, u32} from "./base_types";
import {encodeU32} from "./encoding";
import {Instruction} from "./instructions";
import {ModuleBuilder} from "./module";
import {ValueType, ResultType, FunctionType} from "./wtypes";

export class WBaseFunction {
    constructor(readonly parent: ModuleBuilder, readonly type: FunctionType) {
    }

    getIndex(): funcidx {
        throw "TODO";
    }
}

export class WImportedFunction extends WBaseFunction {
    constructor(parent: ModuleBuilder, type: FunctionType, readonly module: string, readonly name: string) {
        super(parent, type);
    }
}

export class WFunction extends WBaseFunction {
    constructor(parent: ModuleBuilder,
                type: FunctionType,
                readonly locals: ValueType[],
                readonly body: Instruction[],
                readonly exportName?: string) {
        super(parent, type);
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
        const code: byte[] = locals.map(x => [...encodeU32(x[0] as u32), x[1]]).flat(); // locals
        code.push(...this.body.flat(), 0x0B as byte); // expression
        code.push(...encodeU32(BigInt(code.length) as u32));
        return code;
    }
}

export class WFunctionBuilder {
    private _arguments: WLocal[];
    private _locals: WLocal[] = [];
    _getIndex?: () => funcidx;

    constructor(readonly parent: ModuleBuilder, args: ResultType) {
        this._arguments = args.map(t => new WLocal(this._localidx, t));
    }

    get locals(): ReadonlyArray<WLocal> {
        return this._locals;
    }

    addLocal(t: ValueType): WLocal {
        return new WLocal(this._localidx, t);
    }

    get args(): ReadonlyArray<WLocal> {
        return this._arguments;
    }

    getIndex(): funcidx {
        if (this._getIndex) return this._getIndex();
        throw "Function still in construction";
    }

    private _localidx(l: WLocal) {
        const idx = this._arguments.indexOf(l);
        if (idx >= 0) return BigInt(idx) as localidx;
        return BigInt(this._locals.indexOf(l)) as localidx;
    }
}


class WLocal {
    constructor(private readonly lookup: (l: WLocal) => localidx, readonly type: ValueType) {
    }

    getIndex(): localidx {
        return this.lookup(this);
    }
}
