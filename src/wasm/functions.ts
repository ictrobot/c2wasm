import {optimise} from "../optimisation";
import {getFlags} from "../optimisation/flags";
import {funcidx, localidx, byte, tableidx} from "./base_types";
import {encodeU32} from "./encoding";
import {WExpression, WInstruction, Instructions} from "./instructions";
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
    private _builder?: WFunctionBuilder;
    readonly hints: {inline: boolean} = {inline: false};
    readonly instrCounts: {name: string, count: number}[] = [];

    constructor(readonly parent: ModuleBuilder, readonly type: FunctionType, readonly exportName?: string) {
    }

    getIndex(): funcidx {
        return this.parent._funcIndex(this);
    }

    getTableIndex(): tableidx {
        return this.parent._tableIndex(this);
    }

    define(bodyFn: (b: WFunctionBuilder) => WInstruction[]): void {
        if (this._builder !== undefined) throw new Error(`Wasm function already defined`);
        this._builder = new WFunctionBuilder(this, bodyFn);
        optimise(this);

        const expr = this._builder.expr; // clean up function returns
        if (this.type[1].length > 0) {
            // if function returns something
            const finalInstr = expr.get(-1);
            if (finalInstr.name === "return") {
                // final return can be implicit
                expr.pop();
            } else if (expr.stack.length === 0 && finalInstr.name !== "unreachable") {
                // no return at end of function or value left on stack, must return elsewhere
                expr.push(Instructions.unreachable());
            }
        }
    }

    toBytes(): byte[] {
        if (this._builder === undefined) throw new Error(`Wasm function body not defined`);

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
        code.push(...this._builder.expr.encoded); // expression
        code.unshift(...encodeU32(BigInt(code.length)));
        return code;
    }

    get locals(): ReadonlyArray<ValueType> {
        return this._builder?.locals?.map(x => x.type) ?? [];
    }

    get body(): WExpression {
        if (!this._builder) throw new Error("Wasm function body is not yet defined");
        return this._builder.expr;
    }
}

export class WFunctionBuilder {
    private readonly _arguments: WLocal[];
    private readonly _locals: WLocal[] = [];
    private readonly _freeTempLocals: WLocal[] = [];
    readonly expr: WExpression;

    constructor(readonly fn: WFunction, bodyFn: (b: WFunctionBuilder) => WInstruction[]) {
        this._arguments = fn.type[0].map(t => new WLocal(this._localidx.bind(this), t, true));

        this.expr = new WExpression(null, 0, this);
        this.expr.push(...bodyFn(this));
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
}

export class WLocal {
    constructor(private readonly lookup: (l: WLocal) => localidx, readonly type: ValueType, readonly isArgument: boolean) {
    }

    getIndex(): localidx {
        return this.lookup(this);
    }
}
