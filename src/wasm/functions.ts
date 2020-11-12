import {funcidx, localidx, byte} from "./base_types";
import {encodeU32} from "./encoding";
import {WExpression} from "./instructions";
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
                private readonly builder: WFunctionBuilder,
                readonly exportName?: string) {
    }

    getIndex(): funcidx {
        return this.idxFn(this);
    }

    toBytes(): byte[] {
        this.builder.build();

        // RLE is used to compress locals
        const locals: [count: bigint, type: ValueType][] = [];
        let lastType: ValueType | null = null;
        let count = 0n;
        for (const local of this.builder.locals) {
            if (local.type === lastType) {
                count++;
            } else {
                if (lastType) locals.push([count, lastType]);
                lastType = local.type;
                count = 1n;
            }
        }
        if (lastType) locals.push([count, lastType]);

        // encode function body
        const code: byte[] = encodeVec(locals.map(x => [...encodeU32(x[0]), x[1]])); // locals
        code.push(...this.builder.instructions.map(x => x(0)).flat(), 0x0B as byte); // expression
        code.unshift(...encodeU32(BigInt(code.length)));
        return code;
    }
}

export class WFunctionBuilder {
    private readonly _arguments: WLocal[];
    private readonly _locals: WLocal[] = [];
    private readonly _instructions: WExpression = [];
    private _bodyFn: undefined | ((b: WFunctionBuilder) => WExpression);
    _getIndex?: () => funcidx;

    constructor(readonly parent: ModuleBuilder, args: ResultType, bodyFn: (b: WFunctionBuilder) => WExpression) {
        this._arguments = args.map(t => new WLocal(this._localidx.bind(this), t));
        this._bodyFn = bodyFn;
    }

    get locals(): ReadonlyArray<WLocal> {
        return this._locals;
    }

    get localTypes(): ValueType[] {
        return this._locals.map(x => x.type);
    }

    addLocal(t: ValueType): WLocal {
        if (this._bodyFn === undefined) throw new Error("Function already built, cannot add locals");

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

    build(): this {
        if (this._bodyFn !== undefined) {
            this._instructions.push(...this._bodyFn(this));
            this._bodyFn = undefined;
        } else {
            // function has already been built
        }
        return this;
    }

    get instructions(): WExpression {
        if (this._bodyFn !== undefined) throw new Error("Cannot get instructions before built");

        return this._instructions;
    }

    private _localidx(l: WLocal) {
        let idx = this._arguments.indexOf(l);
        if (idx >= 0) return BigInt(idx) as localidx;
        idx = this._locals.indexOf(l);
        if (idx >= 0) return BigInt(this._arguments.length + idx) as localidx;
        throw "Local not found?";
    }
}


export class WLocal {
    constructor(private readonly lookup: (l: WLocal) => localidx, readonly type: ValueType) {
    }

    getIndex(): localidx {
        return this.lookup(this);
    }
}
