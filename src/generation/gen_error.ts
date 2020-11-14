import {CError} from "../c_error";
import type {ParseNode} from "../parsing";
import type {WFnGenerator} from "./generator";

export class GenError extends CError {
    name = "GenerationError";

    constructor(message: string, ctx?: WFnGenerator, node?: ParseNode) {
        super(ctx !== undefined ? `In function '${ctx.fnName}': ${message}` : message, node);
    }
}
