import {byte, globalidx} from "./base_types";
import {encodeConstantInstr} from "./encoding";
import {ModuleBuilder} from "./module";
import {ValueType, encodeGlobal} from "./wtypes";

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
            ...encodeGlobal([this.type, this.mutable]),
            ...encodeConstantInstr(this.initialValue, this.type),
            0x0B as byte
        ];
    }
}
