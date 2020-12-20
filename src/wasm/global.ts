import {byte, globalidx} from "./base_types";
import {encodeConstantInstr} from "./encoding";
import {ModuleBuilder} from "./module";
import {ValueType} from "./wtypes";

export class WGlobal {

    constructor(readonly module: ModuleBuilder,
                readonly type: ValueType,
                readonly mutable: boolean,
                public initialValue: number | bigint,
                readonly exportName?: string) {
    }

    getIndex(): globalidx {
        return this.module._globalIndex(this);
    }

    toBytes(): byte[] {
        return [
            this.type,
            this.mutable ? 0x01 as byte : 0x00 as byte,
            ...encodeConstantInstr(this.initialValue, this.type),
            0x0B as byte
        ];
    }
}
