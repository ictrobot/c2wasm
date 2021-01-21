import {optimize} from "../optimization";
import {getFlags} from "../optimization/flags";
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
    private _body?: WExpression;
    private _locals: ValueType[] = [];

    constructor(readonly parent: ModuleBuilder, readonly type: FunctionType, readonly exportName?: string) {
    }

    getIndex(): funcidx {
        return this.parent._funcIndex(this);
    }

    getTableIndex(): tableidx {
        return this.parent._tableIndex(this);
    }

    define(bodyFn: (b: WFunctionBuilder) => WInstruction[]): void {
        if (this._body !== undefined) throw new Error(`Wasm function already defined`);
        [this._body, this._locals] = WFunctionBuilder.build(this, bodyFn);
    }

    toBytes(): byte[] {
        if (this._body === undefined) throw new Error(`Wasm function body not defined`);

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
        code.push(...this._body.encoded); // expression
        code.unshift(...encodeU32(BigInt(code.length)));
        return code;
    }

    get locals(): ReadonlyArray<ValueType> {
        return this._locals;
    }

    get body(): WExpression {
        if (!this._body) throw new Error("Wasm function body is not yet defined");
        return this._body;
    }
}

export class WFunctionBuilder {
    private readonly _arguments: WLocal[];
    private readonly _locals: WLocal[] = [];
    private readonly _freeTempLocals: WLocal[] = [];

    private constructor(readonly fn: WFunction) {
        this._arguments = fn.type[0].map(t => new WLocal(this._localidx.bind(this), t, true));
    }

    get locals(): ReadonlyArray<WLocal> {
        return this._locals;
    }

    addLocal(t: ValueType): WLocal {
        const local = new WLocal(this._localidx.bind(this), t, false);
        this._locals.push(local);
        return local;
    }

    getTempLocal(type: ValueType): WLocal {
        const index = this._freeTempLocals.findIndex(x => x.type === type);
        if (index < 0) {
            // no previous temporary local can be used, allocate a new one
            return this.addLocal(type);
        } else {
            // reuse temporary local
            return this._freeTempLocals.splice(index, 1)[0];
        }
    }

    freeTempLocal(local: WLocal): void {
        if (getFlags().reallocate_locals) {
            // don't actually reuse variables - we will reallocate locals later
            return;
        }
        this._freeTempLocals.push(local);
    }

    deleteLocal(local: WLocal): void {
        // WARNING! this will invalidate any instructions already encoded
        const index = this._locals.indexOf(local);
        if (index >= 0) this._locals.splice(index, 1);
    }

    wipeLocals(): void {
        // WARNING! this will invalidate any instructions already encoded
        this._locals.splice(0, this._locals.length);
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

    static build(fn: WFunction, bodyFn: (b: WFunctionBuilder) => WInstruction[]): [WExpression, ValueType[]] {
        const builder = new WFunctionBuilder(fn);
        const expression = new WExpression(null, 0, builder);
        expression.push(...bodyFn(builder));
        optimize(expression);
        return [expression, builder.locals.map(x => x.type)];
    }
}

export class WLocal {
    constructor(private readonly lookup: (l: WLocal) => localidx, readonly type: ValueType, readonly isArgument: boolean) {
    }

    getIndex(): localidx {
        return this.lookup(this);
    }
}
