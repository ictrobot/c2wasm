import {byte, globalidx} from "./base_types";
import {WInstruction, Instructions} from "./instructions";
import {ValueType, i32Type, i64Type, f32Type, f64Type} from "./wtypes";

export class WGlobal {

    constructor(private readonly idxFn: (x: WGlobal) => globalidx,
                readonly type: ValueType,
                readonly mutable: boolean,
                public initialValue: number | bigint,
                readonly exportName?: string) {
    }

    getIndex(): globalidx {
        return this.idxFn(this);
    }

    toBytes(): byte[] {
        let initializer: WInstruction;
        if (this.type === i32Type) {
            initializer = Instructions.i32.const(this.initialValue);
        } else if (this.type === i64Type && typeof this.initialValue === "bigint") {
            initializer = Instructions.i64.const(this.initialValue);
        } else if (this.type === f32Type && typeof this.initialValue === "number") {
            initializer = Instructions.f32.const(this.initialValue);
        } else if (this.type === f64Type && typeof this.initialValue === "number") {
            initializer = Instructions.f64.const(this.initialValue);
        } else {
            throw new Error(`Invalid value type (${this.type.toString(16)}) or initial value (${this.initialValue})`);
        }

        return [
            this.type,
            this.mutable ? 0x01 as byte : 0x00 as byte,
            ...initializer(0),
            0x0B as byte
        ];
    }
}
